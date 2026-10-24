import { engineApi, vaultApi } from "@/lib/api";

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

export interface ChatSession {
  session_id: string;
  chat_name?: string;
  latest_created_at: string;
  created_at?: string;
  message_count?: number;
}

export interface ChatSessionsResponse {
  sessions: ChatSession[];
  total_pages: number;
  current_page: number;
  total_items: number;
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  chat_name?: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
}

export interface ChatMessagesResponse {
  session_id: string;
  messages: ChatMessage[];
  total_pages: number;
  current_page: number;
  total_messages: number;
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

export interface SendChatMessageRequest {
  session_id?: string;
  content: string;
  chat_name?: string;
  role?: "user" | "ai";
  generate_ai_reply?: boolean;
}

export interface SendChatMessageResponse {
  session_id: string;
  user_message: ChatMessage;
  ai_message?: ChatMessage | null;
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

  async getChatSessions(params?: {
    page?: number;
    cursor?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ChatSessionsResponse> {
    try {
      const response = await engineApi.get<ChatSessionsResponse>("/chats/sessions", {
        params,
      });
      return response.data;
    } catch (err) {
      try {
        const fallback = await vaultApi.get<ChatSessionsResponse>("/chats/sessions", {
          params,
        });
        return fallback.data;
      } catch {
        throw err;
      }
    }
  },

  async getChatsBySession(
    sessionId: string,
    params?: {
      page?: number;
      cursor?: string | null;
      limit?: number;
      offset?: number;
    }
  ): Promise<ChatMessagesResponse> {
    try {
      const response = await engineApi.get<ChatMessagesResponse>(
        `/chats/sessions/${encodeURIComponent(sessionId)}`,
        { params }
      );
      return response.data;
    } catch (err) {
      try {
        const fallback = await vaultApi.get<ChatMessagesResponse>(
          `/chats/sessions/${encodeURIComponent(sessionId)}`,
          { params }
        );
        return fallback.data;
      } catch {
        throw err;
      }
    }
  },

  async sendChatMessage(payload: SendChatMessageRequest): Promise<SendChatMessageResponse> {
    try {
      const response = await engineApi.post<SendChatMessageResponse>("/chats/message", payload);
      return response.data;
    } catch (err) {
      try {
        const userMsg = await vaultApi.post<ChatMessage>("/chats", {
          session_id: payload.session_id,
          role: payload.role || "user",
          content: payload.content,
          chat_name: payload.chat_name,
        });
        return {
          session_id: userMsg.data.session_id,
          user_message: userMsg.data,
        };
      } catch {
        throw err;
      }
    }
  },

  async seedDemoChats(count: number = 12): Promise<{ status: string; seeded_count: number }> {
    try {
      const response = await engineApi.post<{ status: string; seeded_count: number }>("/chats/seed", null, {
        params: { count },
      });
      return response.data;
    } catch {
      // Fallback
      return { status: "success", seeded_count: 0 };
    }
  },
};


