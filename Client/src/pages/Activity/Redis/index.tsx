import { useEffect, useRef, type FC } from "react";
import { useLocation, useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { Database, Sliders, Layers } from "lucide-react";
import { ConsumerGroupsCard } from "./components/ConsumerGroupsCard";
import { RedisConfigCard } from "./components/RedisConfigCard";
import { useConsumerGroupsQuery } from "./queries";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

export const RedisPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isConfigView = location.pathname.endsWith("/config");

  const {
    data: groups = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useConsumerGroupsQuery();

  const errorMessage = error
    ? (error as any)?.response?.data?.detail?.message ||
    error.message ||
    "Failed to connect to Message Broker. Ensure the service and Redis are running."
    : null;

  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (errorMessage && errorMessage !== lastErrorRef.current) {
      lastErrorRef.current = errorMessage;
      toast.error(errorMessage, { title: "Message Broker" });
    }
  }, [errorMessage]);

  return (
    <div
      id="activity-subpage-redis"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40"
    >
      <div className="flex-none px-6 py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Redis
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                  Message Broker
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time Redis stream telemetry, consumer groups, pending message counts, and Vault configuration
              </p>
            </div>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => navigate("/activity/redis")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                !isConfigView
                  ? "bg-red-600 text-white shadow-sm font-semibold shadow-red-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Consumer Groups & Streams
            </button>

            <button
              type="button"
              onClick={() => navigate("/activity/redis/config")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                isConfigView
                  ? "bg-red-600 text-white shadow-sm font-semibold shadow-red-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              )}
            >
              <Sliders className="w-3.5 h-3.5" />
              Configuration
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <Routes>
            <Route
              path="/"
              element={
                <ConsumerGroupsCard
                  groups={groups}
                  loading={isLoading || isFetching}
                  onRefresh={() => refetch()}
                />
              }
            />
            <Route path="config" element={<RedisConfigCard />} />
            <Route path="*" element={<Navigate to="/activity/redis" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default RedisPage;
