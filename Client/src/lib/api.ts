import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

declare const __SERVICES_CONFIG__: Record<string, string> | undefined;

const dynamicConfig: Record<string, string> =
  typeof __SERVICES_CONFIG__ !== "undefined" && __SERVICES_CONFIG__ ? __SERVICES_CONFIG__ : {};

export const SERVICE_ENDPOINTS: Record<string, string> = {
  messageBroker:
    import.meta.env.VITE_MESSAGE_BROKER_URL ||
    dynamicConfig.message_broker ||
    "",
  vault:
    import.meta.env.VITE_VAULT_URL ||
    dynamicConfig.vault ||
    "",
  operator:
    import.meta.env.VITE_OPERATOR_URL ||
    dynamicConfig.operator ||
    "",
  memory:
    import.meta.env.VITE_MEMORY_URL ||
    dynamicConfig.memory ||
    "",
  engine:
    import.meta.env.VITE_ENGINE_URL ||
    dynamicConfig.engine ||
    "",
  client:
    import.meta.env.VITE_CLIENT_URL ||
    dynamicConfig.client ||
    "",
};

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

export const messageBrokerApi = createServiceClient(SERVICE_ENDPOINTS.messageBroker);
export const vaultApi = createServiceClient(SERVICE_ENDPOINTS.vault);
export const operatorApi = createServiceClient(SERVICE_ENDPOINTS.operator);
export const memoryApi = createServiceClient(SERVICE_ENDPOINTS.memory);
export const engineApi = createServiceClient(SERVICE_ENDPOINTS.engine);

export function updateServiceEndpoints(urls: Record<string, string>) {
  for (const [key, rawUrl] of Object.entries(urls)) {
    const url = (rawUrl || "").trim().replace(/\/$/, "");
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
    if (normalizedKey === "messagebroker" || normalizedKey === "broker") {
      SERVICE_ENDPOINTS.messageBroker = url;
      messageBrokerApi.defaults.baseURL = url;
    } else if (normalizedKey === "vault") {
      SERVICE_ENDPOINTS.vault = url;
      vaultApi.defaults.baseURL = url;
    } else if (normalizedKey === "operator") {
      SERVICE_ENDPOINTS.operator = url;
      operatorApi.defaults.baseURL = url;
    } else if (normalizedKey === "memory") {
      SERVICE_ENDPOINTS.memory = url;
      memoryApi.defaults.baseURL = url;
    } else if (normalizedKey === "engine") {
      SERVICE_ENDPOINTS.engine = url;
      engineApi.defaults.baseURL = url;
    }
  }
}
