import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

/**
 * Service base URLs as defined in the MIRA architecture.
 */
export const SERVICE_ENDPOINTS = {
  messageBroker: "http://127.0.0.1:8000",
  vault: "http://127.0.0.1:8001",
  operator: "http://127.0.0.1:8002",
  memory: "http://127.0.0.1:8003",
  engine: "http://127.0.0.1:8004",
  client: "http://127.0.0.1:8005",
} as const;

/**
 * Create a configured Axios instance for a given base URL.
 */
export function createServiceClient(
  baseURL: string,
  config?: AxiosRequestConfig
): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      Accept: "application/json",
    },
    ...config,
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      console.error(`[API Error] ${error.config?.url}:`, error.message);
      return Promise.reject(error);
    }
  );

  return instance;
}

// Pre-configured Axios service clients for MIRA
export const messageBrokerApi = createServiceClient(SERVICE_ENDPOINTS.messageBroker);
export const vaultApi = createServiceClient(SERVICE_ENDPOINTS.vault);
export const operatorApi = createServiceClient(SERVICE_ENDPOINTS.operator);
export const memoryApi = createServiceClient(SERVICE_ENDPOINTS.memory);
export const engineApi = createServiceClient(SERVICE_ENDPOINTS.engine);

// Default API client (points to Message Broker by default as per architecture)
export const apiClient = messageBrokerApi;

export default axios;
