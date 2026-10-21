import { messageBrokerApi } from "@/lib/api";
import type { ConsumerGroup, CleanResult, FormatResult } from "@/pages/Activity/Redis/types";

export interface DeleteConsumerGroupResponse {
  message: string;
  group_name: string;
  stream_name?: string;
}

export interface JobPayload {
  job_id: string;
  consumer_key: string;
  [key: string]: unknown;
}

export interface JobResponse {
  message: string;
  [key: string]: unknown;
}

export interface ServiceHealth {
  service: string;
  status: string;
}

export const brokerService = {
  async getHealth(): Promise<ServiceHealth> {
    const response = await messageBrokerApi.get<ServiceHealth>("/health");
    return response.data;
  },

  async getConsumerGroups(raw: boolean = false): Promise<ConsumerGroup[]> {
    const response = await messageBrokerApi.get<ConsumerGroup[]>("/redis/consumer-groups", {
      params: raw ? { raw: true } : undefined,
    });
    return response.data;
  },

  async deleteConsumerGroup(
    groupName: string,
    streamName?: string
  ): Promise<DeleteConsumerGroupResponse> {
    const response = await messageBrokerApi.delete<DeleteConsumerGroupResponse>(
      `/redis/consumer-groups/${encodeURIComponent(groupName)}`,
      {
        params: streamName ? { stream_name: streamName } : undefined,
      }
    );
    return response.data;
  },

  async cleanPendingMessages(
    groupName?: string,
    streamName?: string
  ): Promise<CleanResult> {
    const response = await messageBrokerApi.post<CleanResult>("/redis/clean", {
      group_name: groupName || null,
      stream_name: streamName || null,
    });
    return response.data;
  },

  async formatRedis(): Promise<FormatResult> {
    const response = await messageBrokerApi.post<FormatResult>("/redis/format");
    return response.data;
  },

  async enqueueJob(job: JobPayload): Promise<JobResponse> {
    const response = await messageBrokerApi.post<JobResponse>("/jobs", job);
    return response.data;
  },

  async getJobs(consumerKey: string, count: number = 1): Promise<JobPayload[]> {
    const response = await messageBrokerApi.get<JobPayload[]>("/jobs", {
      params: { consumer_key: consumerKey, count },
    });
    return response.data;
  },

  async deleteJob(consumerKey: string, jobId: string): Promise<JobResponse> {
    const response = await messageBrokerApi.delete<JobResponse>("/jobs", {
      params: { consumer_key: consumerKey, job_id: jobId },
    });
    return response.data;
  },
};
