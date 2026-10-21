import type { FC } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { MonitorPlay, Sliders, AppWindow } from "lucide-react";
import { cn } from "@/lib/utils";
import { CaptureConfigurationsPage } from "./CaptureConfigurations";
import { CaptureAppsConfigurationsPage } from "./CaptureAppsConfigurations";

export { CaptureConfigurationsPage } from "./CaptureConfigurations";
export { CaptureAppsConfigurationsPage } from "./CaptureAppsConfigurations";

export const CapturedDataPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Active view driven strictly by React Router URL: /history/captured-data/apps vs /history/captured-data/configurations
  const isAppsView = location.pathname.includes("/captured-data/apps");

  return (
    <div
      id="history-subpage-captured-data"
      className="flex flex-col h-full w-full overflow-hidden select-none bg-zinc-950/40"
    >
      {/* Top Header with Navigation Tabs (consistent with Redis and Logs pages) */}
      <div className="flex-none px-6 py-4 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          {/* Title and Badge */}
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
              <MonitorPlay className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Captured Data
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Operator
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Screen capture automation, recording intervals, data retention, and application capture permissions
              </p>
            </div>
          </div>

          {/* Navigation Tabs (Driven strictly by React Router) */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-900/80 border border-white/[0.08] self-start sm:self-auto shadow-inner">
            <button
              type="button"
              id="tab-btn-capture-configurations"
              onClick={() => navigate("/history/captured-data/configurations")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                !isAppsView
                  ? "bg-blue-600 text-white shadow-sm font-semibold shadow-blue-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              )}
            >
              <Sliders className="w-3.5 h-3.5" />
              Capture Configurations
            </button>

            <button
              type="button"
              id="tab-btn-capture-apps-configurations"
              onClick={() => navigate("/history/captured-data/apps")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                isAppsView
                  ? "bg-blue-600 text-white shadow-sm font-semibold shadow-blue-950/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              )}
            >
              <AppWindow className="w-3.5 h-3.5" />
              Capture Apps Configurations
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport Managed by React Router */}
      <div
        id="captured-data-subpage-viewport"
        className="flex-1 relative h-full w-full overflow-hidden"
      >
        <Routes>
          <Route path="/" element={<Navigate to="configurations" replace />} />
          <Route path="configurations" element={<CaptureConfigurationsPage />} />
          <Route path="apps" element={<CaptureAppsConfigurationsPage />} />
          <Route path="*" element={<Navigate to="configurations" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default CapturedDataPage;
