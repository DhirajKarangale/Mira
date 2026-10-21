import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
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
} as const;

