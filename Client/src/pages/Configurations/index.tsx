import type { FC } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import {
  Sparkles,
  Sliders,
  MonitorPlay,
  Database,
  Terminal,
  Mic,
} from "lucide-react";
import { AiConfigPage } from "./AiConfig";
import { WorkersPage } from "./Workers";
import { CapturedDataPage } from "./Capture";
import { RedisPage } from "./Redis";
import { LogsPage } from "./Logs";
import { MicrophonePage } from "./Microphone";

export { AiConfigPage } from "./AiConfig";
export { WorkersPage } from "./Workers";
export { MicrophonePage } from "./Microphone";

const CONFIGURATIONS_SIDEBAR_ITEMS: readonly SidebarItem[] = [
  {
    key: "activity-control",
    name: "Activity Control",
    icon: MonitorPlay,
  },
  {
    key: "microphone",
    name: "Microphone",
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

export const ConfigurationsPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split("/").filter(Boolean);
  const rawSubTab = segments[1] || "activity-control";
  const activeSubTab =
    rawSubTab === "captured-data" || rawSubTab === "capture"
      ? "activity-control"
      : rawSubTab;

  return (
    <div
      id="page-configurations-container"
      className="flex h-full w-full overflow-hidden select-none"
    >
      <Sidebar
        items={CONFIGURATIONS_SIDEBAR_ITEMS}
        activeKey={activeSubTab}
        onSelect={(key) => navigate(`/configurations/${key}`)}
        title="Configurations"
        icon={Sliders}
        defaultCollapsed={false}
        className="border-r border-white/[0.06] bg-zinc-950/60"
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
          <Route path="microphone/*" element={<MicrophonePage />} />
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
