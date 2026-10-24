import { engineApi } from "@/lib/api";

export interface EngineHealth {
  service: string;
  status: string;
}

export interface EngineStatus {
  service: string;
  status: string;
  active_provider?: string;
  ai_priorities?: string[];
  workers?: Record<string, unknown>;
  ocr_summarization?: Record<string, unknown>;
  embedding_model?: Record<string, unknown>;
}

export interface LLMCallRequest {
  prompt: string;
  work?: string;
}

export interface LLMCallResponse {
  response: string;
  work: string;
  provider?: string;
}

export const engineService = {
  async getHealth(): Promise<EngineHealth> {
    const response = await engineApi.get<EngineHealth>("/health");
    return response.data;
  },

  async getStatus(): Promise<EngineStatus> {
    const response = await engineApi.get<EngineStatus>("/status");
    return response.data;
  },

  async getEmbeddingStatus(): Promise<Record<string, unknown>> {
    const response = await engineApi.get<Record<string, unknown>>("/embedding/status");
    return response.data;
  },

  async getSummarizationStatus(): Promise<Record<string, unknown>> {
    const response = await engineApi.get<Record<string, unknown>>("/summarization/status");
    return response.data;
  },

  async startSummarization(): Promise<{ status: string; details: Record<string, unknown> }> {
    const response = await engineApi.post<{ status: string; details: Record<string, unknown> }>("/summarization/start");
    return response.data;
  },

  async stopSummarization(): Promise<{ status: string; details: Record<string, unknown> }> {
    const response = await engineApi.post<{ status: string; details: Record<string, unknown> }>("/summarization/stop");
    return response.data;
  },

  async syncConfig(): Promise<{ status: string; active_provider?: string; ai_priorities?: string[] }> {
    const response = await engineApi.post<{ status: string; active_provider?: string; ai_priorities?: string[] }>("/config/sync");
    return response.data;
  },

  async callLLM(prompt: string, work: string = "summarization"): Promise<LLMCallResponse> {
    const response = await engineApi.post<LLMCallResponse>("/llm/call", { prompt, work });
    return response.data;
  },
};
