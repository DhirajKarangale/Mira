import { Routes, Route, Navigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import {
  MiraPage,
  ChatsPage,
  UserPage,
  LlmConfigsPage,
  HistoryPage,
  AboutPage,
} from "@/pages";

export function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#080c14] text-zinc-100 select-none border border-white/[0.06]">
      {/* Top Header Strip */}
      <Header />

      {/* Main Content Area - Managed via React Router */}
      <main
        id="main-content-viewport"
        className="flex-1 relative w-full h-[calc(100vh-2.5rem)] overflow-hidden bg-radial from-zinc-900/20 via-[#080c14] to-[#04070d]"
        role="tabpanel"
        aria-live="polite"
      >
        <Routes>
          <Route path="/" element={<Navigate to="/mira" replace />} />
          <Route path="/mira" element={<MiraPage />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/user" element={<UserPage />} />
          <Route path="/ai-configs" element={<LlmConfigsPage />} />
          <Route path="/screen-capturing" element={<Navigate to="/activity/captured-data" replace />} />
          <Route path="/activity/*" element={<HistoryPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/mira" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
