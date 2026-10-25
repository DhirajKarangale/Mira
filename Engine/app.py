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
from user_knowledge_base import (
    init_user_knowledge_base,
    start_user_knowledge_base,
    stop_user_knowledge_base,
    get_user_knowledge_base_status,
    sync_user_knowledge_base_from_vault,
    get_full_knowledge_base,
    search_knowledge_base,
    clear_user_knowledge_base,
    delete_knowledge_base_record,
)

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
    try:
        await start_chat_workers()
    except Exception as e:
        log_error(f'Failed to start Chat module workers: {e}')
    try:
        log('Initializing User Knowledge Base...')
        await asyncio.to_thread(init_user_knowledge_base)
    except Exception as e:
        log_error(f'Failed to initialize User Knowledge Base: {e}')
    try:
        await start_user_knowledge_base()
    except Exception as e:
        log_error(f'Failed to start User Knowledge Base workers: {e}')
    yield
    log('Engine service shutting down cleanly...')
    try:
        await stop_user_knowledge_base()
    except Exception as e:
        log_error(f'Error stopping User Knowledge Base workers: {e}')
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
    kb_status = get_user_knowledge_base_status()
    return {
        'service': 'Engine',
        'status': 'online',
        'active_provider': active_prov,
        'ai_priorities': priorities,
        'workers': workers,
        'ocr_summarization': summarization,
        'embedding_model': embedding_status,
        'chat_workers': chat_status,
        'user_knowledge_base': kb_status,
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

@app.get('/user-knowledge-base/status', status_code=status.HTTP_200_OK)
async def user_knowledge_base_status_endpoint():
    return get_user_knowledge_base_status()

@app.get('/user-knowledge-base', status_code=status.HTTP_200_OK)
async def get_user_knowledge_base_endpoint(query: Optional[str] = None, category: Optional[str] = None, limit: int = 50):
    if query:
        return await asyncio.to_thread(search_knowledge_base, query, category, limit)
    return await asyncio.to_thread(get_full_knowledge_base)

@app.post('/user-knowledge-base/sync', status_code=status.HTTP_200_OK)
async def sync_user_knowledge_base_endpoint():
    synced = await sync_user_knowledge_base_from_vault()
    return {'status': 'synced' if synced else 'unchanged_or_failed'}

@app.post('/user-knowledge-base/start', status_code=status.HTTP_200_OK)
async def start_user_knowledge_base_endpoint():
    started = await start_user_knowledge_base()
    return {'status': 'started' if started else 'already_running', 'details': get_user_knowledge_base_status()}

@app.post('/user-knowledge-base/stop', status_code=status.HTTP_200_OK)
async def stop_user_knowledge_base_endpoint():
    await stop_user_knowledge_base()
    return {'status': 'stopped', 'details': get_user_knowledge_base_status()}

@app.delete('/user-knowledge-base', status_code=status.HTTP_200_OK)
async def delete_user_knowledge_base_endpoint(clear_identity: bool = False):
    success = await asyncio.to_thread(clear_user_knowledge_base, clear_identity=clear_identity)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete user knowledge base data.")
    return {'status': 'deleted', 'message': 'User knowledge base data deleted successfully.'}

@app.delete('/user-knowledge-base/record/{category}/{record_id}', status_code=status.HTTP_200_OK)
async def delete_user_knowledge_base_record_endpoint(category: str, record_id: int):
    success = await asyncio.to_thread(delete_knowledge_base_record, category, record_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Failed to delete record #{record_id} in category '{category}'.")
    return {'status': 'deleted', 'message': f'Record #{record_id} deleted successfully.'}


@app.post('/config/sync', status_code=status.HTTP_200_OK)
async def sync_config():
    success = await asyncio.to_thread(config.CONFIG.fetch_from_vault)
    try:
        from llm.config import load_work_configs
        load_work_configs()
    except Exception as e:
        log_error(f'Failed to reload LLM work configs during sync: {e}')
    try:
        await sync_user_knowledge_base_from_vault()
    except Exception as e:
        log_error(f'Failed to sync User Knowledge Base from Vault: {e}')
    return {'status': 'success' if success else 'partial_or_failed', 'active_provider': config.CONFIG.get_active_provider(), 'ai_priorities': config.CONFIG.get_ai_priorities(), 'user_profile': config.CONFIG.get_user_profile()}

@app.get('/user/profile', status_code=status.HTTP_200_OK)
async def get_user_profile_endpoint():
    return config.CONFIG.get_user_profile()

@app.post('/user/profile', status_code=status.HTTP_200_OK)
async def update_user_profile_endpoint(profile: Dict[str, Any]):
    config.CONFIG.set_user_profile(profile)
    try:
        await sync_user_knowledge_base_from_vault(profile)
    except Exception as e:
        log_error(f'Failed to update User Knowledge Base with profile: {e}')
    return {'status': 'updated', 'user_profile': config.CONFIG.get_user_profile()}


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
