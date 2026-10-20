import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { NavTabId } from "@/types/navigation";
import {
  MiraPage,
  UserPage,
  LlmConfigsPage,
  ScreenCapturingPage,
  HistoryPage,
  AboutPage,
} from "@/pages";

export function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>("mira");

  const renderActivePage = () => {
    switch (activeTab) {
      case "mira":
        return <MiraPage />;
      case "user":
        return <UserPage />;
      case "llm-configs":
        return <LlmConfigsPage />;
      case "screen-capturing":
        return <ScreenCapturingPage />;
      case "history":
        return <HistoryPage />;
      case "about":
        return <AboutPage />;
      default:
        return <MiraPage />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#080c14] text-zinc-100 select-none border border-white/[0.06]">
      {/* Top Header Strip */}
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area - Occupies entire remaining area below the header */}
      <main
        id="main-content-viewport"
        className="flex-1 relative w-full h-[calc(100vh-2.5rem)] overflow-hidden bg-radial from-zinc-900/20 via-[#080c14] to-[#04070d]"
        role="tabpanel"
        aria-live="polite"
      >
        {renderActivePage()}
      </main>
    </div>
  );
}

export default App;
