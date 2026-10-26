import type { FC } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Sidebar, type SidebarItem } from "@/components/Sidebar";
import { Newspaper, Wrench } from "lucide-react";
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

  const segments = location.pathname.split("/").filter(Boolean);
  const rawSubTab = segments[1] || "news";
  const activeSubTab = rawSubTab;

  return (
    <div
      id="page-tools-container"
      className="flex h-full w-full overflow-hidden select-none"
    >
      <Sidebar
        items={TOOLS_SIDEBAR_ITEMS}
        activeKey={activeSubTab}
        onSelect={(key) => navigate(`/tools/${key}`)}
        title="Tools"
        icon={Wrench}
        defaultCollapsed={false}
        className="border-r border-white/[0.06] bg-zinc-950/60"
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
