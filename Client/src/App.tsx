import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import {
  MiraPage,
  ChatsPage,
  UserPage,
  ConfigurationsPage,
  AboutPage,
} from "@/pages";
import { useGlobalChatSync } from "@/hooks/useGlobalChatSync";
import { useMiraWakeWord } from "@/hooks/useMiraWakeWord";

function ActivityRedirect() {
  const { "*": rest } = useParams();
  const normalized = (rest || "")
    .replace(/^captured-data/, "activity-control")
    .replace(/^capture/, "activity-control");
  return (
    <Navigate
      to={`/configurations/${normalized || "activity-control"}`}
      replace
    />
  );
}

function AiConfigsRedirect() {
  const { "*": rest } = useParams();
  if (rest === "engine-workers") {
    return <Navigate to="/configurations/workers" replace />;
  }
  return <Navigate to={`/configurations/ai-config/${rest || ""}`} replace />;
}

export function App() {
  useGlobalChatSync();
  useMiraWakeWord();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#080c14] text-zinc-100 select-none border border-white/[0.06]">
      <Header />

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
          <Route path="/configurations/*" element={<ConfigurationsPage />} />
          <Route path="/activity" element={<Navigate to="/configurations/activity-control" replace />} />
          <Route path="/activity/*" element={<ActivityRedirect />} />
          <Route path="/capture" element={<Navigate to="/configurations/activity-control" replace />} />
          <Route path="/capture/*" element={<ActivityRedirect />} />
          <Route path="/ai-configs" element={<Navigate to="/configurations/ai-config" replace />} />
          <Route path="/ai-configs/*" element={<AiConfigsRedirect />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/mira" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
