import type { FC } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import { MonitorPlay, MessageSquare, Terminal, Database } from "lucide-react";
import { CapturedDataPage } from "./CapturedData";
import { ChatsPage } from "./Chats";
import { LogsPage } from "./Logs";
import { RedisPage } from "./Redis";

const HISTORY_SIDEBAR_ITEMS: readonly SidebarItem[] = [
  {
    key: "chats",
    name: "Chats",
    icon: MessageSquare,
  },
  {
    key: "captured-data",
    name: "Captured Data",
    icon: MonitorPlay,
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

export const HistoryPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Extract active subtab from current URL e.g. /history/redis -> "redis"
  const segments = location.pathname.split("/").filter(Boolean);
  const activeSubTab = segments[1] || "captured-data";

  return (
    <div
      id="page-history-container"
      className="flex h-full w-full overflow-hidden select-none"
    >
      {/* History Sidebar for subpages */}
      <Sidebar
        items={HISTORY_SIDEBAR_ITEMS}
        activeKey={activeSubTab === "message-broker-data" ? "redis" : activeSubTab}
        onSelect={(key) => navigate(`/history/${key}`)}
        title="History"
        defaultCollapsed={false}
        className="border-r border-white/[0.06] bg-zinc-950/60"
      />

      {/* History Subpage Viewport Managed by React Router */}
      <div
        id="history-subpage-viewport"
        className="flex-1 relative h-full w-full overflow-hidden"
      >
        <Routes>
          <Route path="/" element={<Navigate to="captured-data" replace />} />
          <Route path="captured-data/*" element={<CapturedDataPage />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="logs/*" element={<LogsPage />} />
          <Route path="redis/*" element={<RedisPage />} />
          <Route path="message-broker-data" element={<Navigate to="/history/redis" replace />} />
          <Route path="*" element={<Navigate to="captured-data" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default HistoryPage;
