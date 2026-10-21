import { QueryClient } from "@tanstack/react-query";

/**
 * Global QueryClient instance with curated defaults for MIRA desktop & web environments.
 * - staleTime: 1 minute default prevents over-fetching on rapid component remounts.
 * - gcTime: 10 minutes retains inactive query data in memory.
 * - refetchOnWindowFocus: false prevents desktop/OS focus switches from triggering background refetches.
 * - retry: 1 minimizes waiting time on service errors while allowing quick transient recovery.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000, // 15 minutes - ultra responsive, zero-latency caching
      gcTime: 60 * 60 * 1000, // 1 hour memory retention
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false, // Serve cached data immediately on navigation without refetching
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Centralized, type-safe query keys for MIRA across all backend services:
 * - Vault (port 8001)
 * - Operator (port 8002)
 * - Message Broker (port 8000)
 */
export const QUERY_KEYS = {
  user: {
    all: ["vault", "user"] as const,
    details: ["vault", "user", "details"] as const,
  },
  operator: {
    all: ["operator"] as const,
    config: ["vault", "config", "operator"] as const,
    status: ["operator", "status"] as const,
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
} as const;
