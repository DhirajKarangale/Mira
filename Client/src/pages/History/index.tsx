import { useState, type FC } from "react";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import { Camera, MessageSquare, Terminal, Network } from "lucide-react";
import type { HistorySubTabId } from "./types";
import { CapturedDataPage } from "./CapturedData";
import { ChatsPage } from "./Chats";
import { LogsPage } from "./Logs";
import { MessageBrokerDataPage } from "./MessageBrokerData";

const HISTORY_SIDEBAR_ITEMS: readonly SidebarItem[] = [
  {
    key: "captured-data",
    name: "Captured Data",
    icon: Camera,
  },
  {
    key: "chats",
    name: "Chats",
    icon: MessageSquare,
  },
  {
    key: "logs",
    name: "Logs",
    icon: Terminal,
  },
  {
    key: "message-broker-data",
    name: "Message Broker Data",
    icon: Network,
  },
] as const;

export const HistoryPage: FC = () => {
  const [activeSubTab, setActiveSubTab] =
    useState<HistorySubTabId>("captured-data");

  const renderActiveSubpage = () => {
    switch (activeSubTab) {
      case "captured-data":
        return <CapturedDataPage />;
      case "chats":
        return <ChatsPage />;
      case "logs":
        return <LogsPage />;
      case "message-broker-data":
        return <MessageBrokerDataPage />;
      default:
        return <CapturedDataPage />;
    }
  };

  return (
    <div
      id="page-history-container"
      className="flex h-full w-full overflow-hidden select-none"
    >
      {/* History Sidebar for subpages */}
      <Sidebar
        items={HISTORY_SIDEBAR_ITEMS}
        activeKey={activeSubTab}
        onSelect={(key) => setActiveSubTab(key as HistorySubTabId)}
        title="History"
        defaultCollapsed={false}
        className="border-r border-white/[0.06] bg-zinc-950/60"
      />

      {/* History Subpage Viewport */}
      <div
        id="history-subpage-viewport"
        className="flex-1 relative h-full w-full overflow-hidden"
      >
        {renderActiveSubpage()}
      </div>
    </div>
  );
};

export default HistoryPage;
