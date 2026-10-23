from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

import config
from vault_logger import log, log_error, mask_sensitive
from llm import call_llm, get_work_config

@asynccontextmanager
async def lifespan(app: FastAPI):
    log("Engine service starting up...")
    try:
        # Sync configurations from Vault at startup
        config.CONFIG.fetch_from_vault()
    except Exception as e:
        log_error(f"Startup configuration sync from Vault encountered an error: {e}")
    yield
    log("Engine service shutting down cleanly...")

app = FastAPI(
    title="MIRA Engine Service",
    description="LLM orchestration, model execution, provider fallback, and AI workflow coordination",
    version="1.0.0",
    lifespan=lifespan,
)

class LLMCallRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Prompt text to send to LLM")
    work: str = Field(default="summarization", description="Work category (e.g. summarization, chat, extraction)")

class LLMCallResponse(BaseModel):
    response: str
    work: str
    provider: Optional[str] = None

@app.get("/health", status_code=status.HTTP_200_OK)
async def health():
    return {
        "service": "Engine",
        "status": "online",
    }

@app.get("/status", status_code=status.HTTP_200_OK)
async def get_status():
    priorities = config.CONFIG.get_ai_priorities()
    active_prov = config.CONFIG.get_active_provider()
    workers = config.CONFIG.get_workers_config()
    return {
        "service": "Engine",
        "status": "online",
        "active_provider": active_prov,
        "ai_priorities": priorities,
        "workers": workers,
    }

@app.post("/config/sync", status_code=status.HTTP_200_OK)
async def sync_config():
    success = await asyncio.to_thread(config.CONFIG.fetch_from_vault)
    return {
        "status": "success" if success else "partial_or_failed",
        "active_provider": config.CONFIG.get_active_provider(),
        "ai_priorities": config.CONFIG.get_ai_priorities(),
    }

@app.post("/llm/call", response_model=LLMCallResponse, status_code=status.HTTP_200_OK)
async def call_llm_endpoint(request: LLMCallRequest):
    try:
        result = await asyncio.to_thread(call_llm, request.prompt, request.work)
        active_prov = config.CONFIG.get_active_provider()
        return LLMCallResponse(
            response=result,
            work=request.work,
            provider=active_prov,
        )
    except Exception as e:
        log_error(f"Endpoint call failed: {mask_sensitive(str(e))}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to complete AI request."}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=config.SERVER_HOST, port=config.SERVER_PORT, reload=False)
