import { memoryApi } from "@/lib/api";

export interface MemoryHealth {
  service: string;
  status: string;
}

export interface MemoryStatus {
  service: string;
  status: string;
  workers: Record<string, unknown>;
  image_diff_threshold: number;
}

export interface WorkerControlResponse {
  status: string;
  workers: Record<string, unknown>;
}

export interface ExtractDataRequest {
  image_path: string;
}

export interface ExtractDataResponse {
  status: string;
  image_path: string;
  shape: number[];
  grayscale_shape: number[];
  extracted_text: string;
}

export interface ProcessJobRequest {
  job_id: string;
  app_name?: string;
  os?: string;
  image_path: string;
}

export interface ProcessJobResponse {
  status: string;
  success: boolean;
}

export interface KnowledgeBaseItem {
  name: string;
  start_date: string;
  end_date: string;
  start_date_formatted: string;
  end_date_formatted: string;
  days_coverage: number;
  is_current_month: boolean;
  is_active?: boolean;
  points_count?: number;
  size_bytes?: number;
  path?: string;
}

export interface KnowledgeBaseListResponse {
  status: string;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  knowledge_bases: KnowledgeBaseItem[];
}

export interface KnowledgeBaseListParams {
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DeleteKnowledgeBaseResponse {
  status: string;
  message: string;
  name: string;
}

export const memoryService = {
  async getHealth(): Promise<MemoryHealth> {
    const response = await memoryApi.get<MemoryHealth>("/health");
    return response.data;
  },

  async getStatus(): Promise<MemoryStatus> {
    const response = await memoryApi.get<MemoryStatus>("/status");
    return response.data;
  },

  async startWorkers(): Promise<WorkerControlResponse> {
    const response = await memoryApi.post<WorkerControlResponse>("/workers/start");
    return response.data;
  },

  async stopWorkers(): Promise<WorkerControlResponse> {
    const response = await memoryApi.post<WorkerControlResponse>("/workers/stop");
    return response.data;
  },

  async extractData(imagePath: string): Promise<ExtractDataResponse> {
    const response = await memoryApi.post<ExtractDataResponse>("/extract", {
      image_path: imagePath,
    });
    return response.data;
  },

  async processJob(job: ProcessJobRequest): Promise<ProcessJobResponse> {
    const response = await memoryApi.post<ProcessJobResponse>("/process-job", job);
    return response.data;
  },

  async getKnowledgeBases(
    params?: KnowledgeBaseListParams
  ): Promise<KnowledgeBaseListResponse> {
    const response = await memoryApi.get<KnowledgeBaseListResponse>(
      "/knowledge-base",
      { params }
    );
    return response.data;
  },

  async deleteKnowledgeBase(
    name: string
  ): Promise<DeleteKnowledgeBaseResponse> {
    const response = await memoryApi.delete<DeleteKnowledgeBaseResponse>(
      `/knowledge-base/${encodeURIComponent(name)}`
    );
    return response.data;
  },
};

