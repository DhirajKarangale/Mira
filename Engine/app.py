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
from chat import router as chat_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    log('Engine service starting up...')
    try:
        config.CONFIG.fetch_from_vault()
    except Exception as e:
        log_error(f'Startup configuration sync from Vault encountered an error: {e}')
    try:
        log('Initializing embedding model manager...')
        await asyncio.to_thread(initialize_embedding_model)
    except Exception as e:
        log_error(f'Failed to initialize embedding model manager: {e}')
    try:
        await start_ocr_summarization()
    except Exception as e:
        log_error(f'Failed to start OCR Summarization module: {e}')
    yield
    log('Engine service shutting down cleanly...')
    try:
        await stop_ocr_summarization()
    except Exception as e:
        log_error(f'Error stopping OCR Summarization module: {e}')
app = FastAPI(title='MIRA Engine Service', description='LLM orchestration, model execution, provider fallback, and AI workflow coordination', version='1.0.0', lifespan=lifespan)
app.include_router(chat_router)


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
    return {'service': 'Engine', 'status': 'online', 'active_provider': active_prov, 'ai_priorities': priorities, 'workers': workers, 'ocr_summarization': summarization, 'embedding_model': embedding_status}

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
    success = await asyncio.to_thread(config.CONFIG.fetch_from_vault)
    try:
        from llm.config import load_work_configs
        load_work_configs()
    except Exception as e:
        log_error(f'Failed to reload LLM work configs during sync: {e}')
    return {'status': 'success' if success else 'partial_or_failed', 'active_provider': config.CONFIG.get_active_provider(), 'ai_priorities': config.CONFIG.get_ai_priorities()}

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
