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

/**
 * Centralized Message Broker API Service
 * Single source of truth for all communications with Message Broker & Redis (http://127.0.0.1:8000).
 */
export const brokerService = {
  // -------------------------------------------------------------
  // Redis Telemetry & Stream Management
  // -------------------------------------------------------------

  /**
   * Fetch active consumer groups and telemetry from Message Broker.
   * Canonical: GET /redis/consumer-groups
   */
  async getConsumerGroups(raw: boolean = false): Promise<ConsumerGroup[]> {
    const response = await messageBrokerApi.get<ConsumerGroup[]>("/redis/consumer-groups", {
      params: raw ? { raw: true } : undefined,
    });
    return response.data;
  },

  /**
   * Delete a selected Redis consumer group from its stream.
   * Canonical: DELETE /redis/consumer-groups/{group_name}
   */
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

  /**
   * Clean pending or unprocessed messages across a specific or all consumer groups.
   * Canonical: POST /redis/clean
   */
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

  /**
   * Format Redis: Flushes all Redis streams and stream lookup keys.
   * Canonical: POST /redis/format
   */
  async formatRedis(): Promise<FormatResult> {
    const response = await messageBrokerApi.post<FormatResult>("/redis/format");
    return response.data;
  },

  // -------------------------------------------------------------
  // Jobs & Event Bus
  // -------------------------------------------------------------

  /**
   * Publish a job payload to the event bus stream.
   * Canonical: POST /jobs
   */
  async enqueueJob(job: JobPayload): Promise<JobResponse> {
    const response = await messageBrokerApi.post<JobResponse>("/jobs", job);
    return response.data;
  },

  /**
   * Dequeue pending jobs from the event bus stream.
   * Canonical: GET /jobs
   */
  async getJobs(consumerKey: string, count: number = 1): Promise<JobPayload[]> {
    const response = await messageBrokerApi.get<JobPayload[]>("/jobs", {
      params: { consumer_key: consumerKey, count },
    });
    return response.data;
  },

  /**
   * Acknowledge and delete a job from the stream.
   * Canonical: DELETE /jobs
   */
  async deleteJob(consumerKey: string, jobId: string): Promise<JobResponse> {
    const response = await messageBrokerApi.delete<JobResponse>("/jobs", {
      params: { consumer_key: consumerKey, job_id: jobId },
    });
    return response.data;
  },
};
