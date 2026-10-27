import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: (failureCount, error: any) => {
        // While local microservices initialize on launch, retry connection errors up to 4 times
        const msg = String(error?.message || "").toLowerCase();
        const code = String(error?.code || "").toUpperCase();
        const isNetworkErr =
          code === "ERR_NETWORK" ||
          code === "ECONNREFUSED" ||
          msg.includes("network error") ||
          msg.includes("failed to fetch");
        if (isNetworkErr && failureCount < 4) {
          return true;
        }
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const QUERY_KEYS = {
  user: {
    all: ["vault", "user"] as const,
    details: ["vault", "user", "details"] as const,
  },
  operator: {
    all: ["operator"] as const,
    config: ["vault", "config", "operator"] as const,
    status: ["operator", "status"] as const,
    apps: ["operator", "apps"] as const,
    microphone: ["operator", "microphone"] as const,
    microphoneStatus: ["operator", "microphone", "status"] as const,
  },
  redis: {
    all: ["redis"] as const,
    config: ["vault", "config", "redis"] as const,
    consumerGroups: ["messageBroker", "redis", "consumerGroups"] as const,
  },
  logs: {
    all: ["logs"] as const,
    config: ["vault", "config", "logs"] as const,
    list: (filters: Record<string, unknown>, page: number, limit: number) =>
      ["vault", "logs", "list", { ...filters, page, limit }] as const,
  },
  ai: {
    all: ["vault", "ai"] as const,
    providers: ["vault", "ai", "providers"] as const,
    priorities: ["vault", "ai", "priorities"] as const,
    configs: ["vault", "ai", "configs"] as const,
    config: (provider: string) => ["vault", "ai", "config", provider.toLowerCase()] as const,
  },
  engine: {
    all: ["vault", "engine"] as const,
    workers: ["vault", "engine", "workers"] as const,
  },
  memory: {
    all: ["memory"] as const,
    status: ["memory", "status"] as const,
    knowledgeBases: (filters?: unknown, page?: number, limit?: number) =>
      ["memory", "knowledgeBases", { ...((filters as Record<string, unknown>) || {}), page, limit }] as const,
  },
  dailySuggestions: {
    all: ["daily_suggestions"] as const,
    pageData: ["daily_suggestions", "page_data"] as const,
  },
} as const;

