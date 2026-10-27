import { useState, type FC } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import { Newspaper, Wrench, PanelLeftOpen } from "lucide-react";
import { NewsToolPage } from "./News";

export { NewsToolPage } from "./News";

const TOOLS_SIDEBAR_ITEMS: readonly SidebarItem[] = [
  {
    key: "news",
    name: "News",
    icon: Newspaper,
    badge: "GNews",
  },
] as const;

export const ToolsPage: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const segments = location.pathname.split("/").filter(Boolean);
  const rawSubTab = segments[1] || "news";
  const activeSubTab = rawSubTab;
  const activeItem = TOOLS_SIDEBAR_ITEMS.find((it) => it.key === activeSubTab);

  return (
    <div
      id="page-tools-container"
      className="flex flex-col md:flex-row h-full w-full overflow-hidden select-none"
    >
      {/* Mobile Top Bar with Drawer Trigger */}
      <div className="md:hidden flex items-center justify-between px-3.5 h-11 border-b border-white/[0.08] bg-zinc-950/80 backdrop-blur-md shrink-0 z-20">
        <button
          type="button"
          id="btn-tools-mobile-sidebar-toggle"
          onClick={() => setIsOverlayOpen(true)}
          className="flex items-center gap-2.5 text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <PanelLeftOpen className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-zinc-400">Tools</span>
            <span className="text-zinc-600">/</span>
            <span className="text-cyan-400">{activeItem?.name || "News"}</span>
          </div>
        </button>
      </div>

      <Sidebar
        items={TOOLS_SIDEBAR_ITEMS}
        activeKey={activeSubTab}
        onSelect={(key) => {
          navigate(`/tools/${key}`);
          setIsOverlayOpen(false);
        }}
        title="Tools"
        icon={Wrench}
        isOverlayOpen={isOverlayOpen}
        onCloseOverlay={() => setIsOverlayOpen(false)}
        defaultCollapsed={false}
        className="border-r border-white/[0.08] bg-zinc-950/80 shadow-lg"
      />

      <div
        id="tools-subpage-viewport"
        className="flex-1 relative h-full w-full overflow-hidden"
      >
        <Routes>
          <Route path="/" element={<Navigate to="news" replace />} />
          <Route path="news/*" element={<NewsToolPage />} />
          <Route path="*" element={<Navigate to="news" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default ToolsPage;
