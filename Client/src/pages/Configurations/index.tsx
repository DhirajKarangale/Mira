import { useState, type FC } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import {
  Sparkles,
  Sliders,
  MonitorPlay,
  Database,
  Terminal,
  Mic,
  PanelLeftOpen,
} from "lucide-react";
import { AiConfigPage } from "./AiConfig";
import { WorkersPage } from "./Workers";
import { CapturedDataPage } from "./Capture";
import { RedisPage } from "./Redis";
import { LogsPage } from "./Logs";
import { MicrophonePage } from "./Microphone";

export { AiConfigPage } from "./AiConfig";
export { WorkersPage } from "./Workers";
export { MicrophonePage, MicrophonePage as VoicePage } from "./Microphone";

const CONFIGURATIONS_SIDEBAR_ITEMS: readonly SidebarItem[] = [
  {
    key: "activity-control",
    name: "Activity Control",
    icon: MonitorPlay,
  },
  {
    key: "voice",
    name: "Voice & Mic",
    icon: Mic,
  },
  {
    key: "ai-config",
    name: "AI Config",
    icon: Sparkles,
  },
  {
    key: "workers",
    name: "Workers",
    icon: Sliders,
  },
  {
    key: "redis",
    name: "Redis",
    icon: Database,
  },
  {
    key: "logs",
    name: "Logs",
    icon: Terminal,
  },
] as const;

function MicrophoneSubpathRedirect() {
  const { "*": rest } = useParams();
  return <Navigate to={`/configurations/voice${rest ? `/${rest}` : ""}`} replace />;
}

export const ConfigurationsPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const segments = location.pathname.split("/").filter(Boolean);
  const rawSubTab = segments[1] || "activity-control";
  const activeSubTab =
    rawSubTab === "captured-data" || rawSubTab === "capture"
      ? "activity-control"
      : rawSubTab === "microphone" || rawSubTab === "mic"
      ? "voice"
      : rawSubTab;

  const activeItem = CONFIGURATIONS_SIDEBAR_ITEMS.find((it) => it.key === activeSubTab);

  return (
    <div
      id="page-configurations-container"
      className="flex flex-col md:flex-row h-full w-full overflow-hidden select-none"
    >
      {/* Mobile Top Bar with Drawer Trigger */}
      <div className="md:hidden flex items-center justify-between px-3.5 h-11 border-b border-white/[0.08] bg-zinc-950/80 backdrop-blur-md shrink-0 z-20">
        <button
          type="button"
          id="btn-configurations-mobile-sidebar-toggle"
          onClick={() => setIsOverlayOpen(true)}
          className="flex items-center gap-2.5 text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <PanelLeftOpen className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-zinc-400">Configurations</span>
            <span className="text-zinc-600">/</span>
            <span className="text-cyan-400">{activeItem?.name || "Settings"}</span>
          </div>
        </button>
      </div>

      <Sidebar
        items={CONFIGURATIONS_SIDEBAR_ITEMS}
        activeKey={activeSubTab}
        onSelect={(key) => {
          navigate(`/configurations/${key}`);
          setIsOverlayOpen(false);
        }}
        title="Configurations"
        icon={Sliders}
        isOverlayOpen={isOverlayOpen}
        onCloseOverlay={() => setIsOverlayOpen(false)}
        defaultCollapsed={false}
        className="border-r border-white/[0.08] bg-zinc-950/80 shadow-lg"
      />

      <div
        id="configurations-subpage-viewport"
        className="flex-1 relative h-full w-full overflow-hidden"
      >
        <Routes>
          <Route path="/" element={<Navigate to="activity-control" replace />} />
          <Route path="activity-control/*" element={<CapturedDataPage />} />
          <Route
            path="capture/*"
            element={<Navigate to="/configurations/activity-control" replace />}
          />
          <Route
            path="captured-data/*"
            element={<Navigate to="/configurations/activity-control/data" replace />}
          />
          <Route path="voice/*" element={<MicrophonePage />} />
          <Route path="microphone/*" element={<MicrophoneSubpathRedirect />} />
          <Route path="ai-config/*" element={<AiConfigPage />} />
          <Route path="workers/*" element={<WorkersPage />} />
          <Route path="redis/*" element={<RedisPage />} />
          <Route path="logs/*" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="activity-control" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default ConfigurationsPage;
