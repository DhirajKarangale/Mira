from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
import config
from vault_logger import log, log_error, mask_sensitive
from llm import call_llm, get_work_config
from ocr_summarization import start_ocr_summarization, stop_ocr_summarization, get_summarization_status
from embedding import initialize_embedding_model, get_embedding_status
from chat import router as chat_router, start_chat_workers, stop_chat_workers, get_chat_status
from daily_suggestions import (
    daily_suggestions_router,
    start_daily_suggestions,
    stop_daily_suggestions,
    get_daily_suggestions_status,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    log('Engine service starting up...')
    try:
        config.CONFIG.fetch_from_vault()
    except Exception as e:
        log_error(f'Startup configuration sync from Vault encountered an error: {e}')

    # Start chat workers immediately so chat messages can be accepted and processed right away
    try:
        await start_chat_workers()
    except Exception as e:
        log_error(f'Failed to start Chat module workers: {e}')

    # Run heavy embedding model loading and background summarization asynchronously so port 9007 opens immediately
    async def _async_background_init():
        try:
            log('Initializing embedding model manager in background...')
            await asyncio.to_thread(initialize_embedding_model)
        except Exception as e:
            log_error(f'Failed to initialize embedding model manager: {e}')
        try:
            await start_ocr_summarization()
        except Exception as e:
            log_error(f'Failed to start OCR Summarization module: {e}')
        try:
            await start_daily_suggestions()
        except Exception as e:
            log_error(f'Failed to start Daily Suggestions module: {e}')

    bg_task = asyncio.create_task(_async_background_init())

    yield
    log('Engine service shutting down cleanly...')
    bg_task.cancel()
    try:
        await stop_daily_suggestions()
    except Exception as e:
        log_error(f'Error stopping Daily Suggestions module: {e}')
    try:
        await stop_chat_workers()
    except Exception as e:
        log_error(f'Error stopping Chat module workers: {e}')
    try:
        await stop_ocr_summarization()
    except Exception as e:
        log_error(f'Error stopping OCR Summarization module: {e}')
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI(title='MIRA Engine Service', description='LLM orchestration, model execution, provider fallback, and AI workflow coordination', version='1.0.0', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)
app.include_router(chat_router)
app.include_router(daily_suggestions_router)



class LLMCallRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description='Prompt text to send to LLM')
    work: str = Field(default='summarization', description='Work category (e.g. summarization, chat, extraction)')

class LLMCallResponse(BaseModel):
    response: str
    work: str
    provider: Optional[str] = None

@app.get('/health', status_code=status.HTTP_200_OK)
async def health():
    return {'service': 'Engine', 'status': 'online'}

@app.get('/status', status_code=status.HTTP_200_OK)
async def get_status():
    priorities = config.CONFIG.get_ai_priorities()
    active_prov = config.CONFIG.get_active_provider()
    workers = config.CONFIG.get_workers_config()
    summarization = get_summarization_status()
    embedding_status = get_embedding_status()
    chat_status = get_chat_status()
    ds_status = get_daily_suggestions_status()
    return {
        'service': 'Engine',
        'status': 'online',
        'active_provider': active_prov,
        'ai_priorities': priorities,
        'workers': workers,
        'ocr_summarization': summarization,
        'embedding_model': embedding_status,
        'chat_workers': chat_status,
        'daily_suggestions': ds_status,
    }

@app.get('/embedding/status', status_code=status.HTTP_200_OK)
async def embedding_status_endpoint():
    return get_embedding_status()

@app.get('/summarization/status', status_code=status.HTTP_200_OK)
async def summarization_status_endpoint():
    return get_summarization_status()

@app.post('/summarization/start', status_code=status.HTTP_200_OK)
async def summarization_start_endpoint():
    started = await start_ocr_summarization()
    return {'status': 'started' if started else 'already_running', 'details': get_summarization_status()}

@app.post('/summarization/stop', status_code=status.HTTP_200_OK)
async def summarization_stop_endpoint():
    await stop_ocr_summarization()
    return {'status': 'stopped', 'details': get_summarization_status()}


@app.post('/config/sync', status_code=status.HTTP_200_OK)
async def sync_config():
    old_profile = config.CONFIG.get_user_profile() or {}
    success = await asyncio.to_thread(config.CONFIG.fetch_from_vault)
    new_profile = config.CONFIG.get_user_profile() or {}
    try:
        from llm.config import load_work_configs
        load_work_configs()
    except Exception as e:
        log_error(f'Failed to reload LLM work configs during sync: {e}')

    old_loc = (
        (old_profile.get("city") or "").strip().lower(),
        (old_profile.get("country") or "").strip().lower(),
        (old_profile.get("state") or "").strip().lower(),
        str(old_profile.get("latitude") or ""),
        str(old_profile.get("longitude") or ""),
    )
    new_loc = (
        (new_profile.get("city") or "").strip().lower(),
        (new_profile.get("country") or "").strip().lower(),
        (new_profile.get("state") or "").strip().lower(),
        str(new_profile.get("latitude") or ""),
        str(new_profile.get("longitude") or ""),
    )
    if old_loc != new_loc:
        log(f"[Engine] Location changed via config sync from {old_loc} to {new_loc}. Canceling in-progress weather/news and re-running.")
        from daily_suggestions import scheduler
        asyncio.create_task(scheduler.handle_location_change())

    return {'status': 'success' if success else 'partial_or_failed', 'active_provider': config.CONFIG.get_active_provider(), 'ai_priorities': config.CONFIG.get_ai_priorities(), 'user_profile': new_profile}

@app.get('/user/profile', status_code=status.HTTP_200_OK)
async def get_user_profile_endpoint():
    return config.CONFIG.get_user_profile()

@app.post('/user/profile', status_code=status.HTTP_200_OK)
async def update_user_profile_endpoint(profile: Dict[str, Any]):
    old_profile = config.CONFIG.get_user_profile() or {}
    config.CONFIG.set_user_profile(profile)
    new_profile = config.CONFIG.get_user_profile() or {}

    old_loc = (
        (old_profile.get("city") or "").strip().lower(),
        (old_profile.get("country") or "").strip().lower(),
        (old_profile.get("state") or "").strip().lower(),
        str(old_profile.get("latitude") or ""),
        str(old_profile.get("longitude") or ""),
    )
    new_loc = (
        (new_profile.get("city") or "").strip().lower(),
        (new_profile.get("country") or "").strip().lower(),
        (new_profile.get("state") or "").strip().lower(),
        str(new_profile.get("latitude") or ""),
        str(new_profile.get("longitude") or ""),
    )
    if old_loc != new_loc:
        log(f"[Engine] Location changed from {old_loc} to {new_loc}. Canceling in-progress weather/news and re-running.")
        from daily_suggestions import scheduler
        asyncio.create_task(scheduler.handle_location_change())

    return {'status': 'updated', 'user_profile': new_profile}


@app.post('/llm/call', response_model=LLMCallResponse, status_code=status.HTTP_200_OK)
async def call_llm_endpoint(request: LLMCallRequest):
    try:
        result = await asyncio.to_thread(call_llm, request.prompt, request.work)
        active_prov = config.CONFIG.get_active_provider()
        return LLMCallResponse(response=result, work=request.work, provider=active_prov)
    except Exception as e:
        log_error(f'Endpoint call failed: {mask_sensitive(str(e))}')
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={'message': 'Failed to complete AI request.'})
if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app:app', host=config.SERVER_HOST, port=config.SERVER_PORT, reload=False)
