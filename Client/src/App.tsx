import { useEffect } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import {
  MiraPage,
  ChatsPage,
  ToolsPage,
  UserPage,
  ConfigurationsPage,
  AboutPage,
} from "@/pages";
import { useGlobalChatSync } from "@/hooks/useGlobalChatSync";
import { useVoiceSync } from "@/hooks/useVoiceSync";
import { useMicSync } from "@/modules/mic";
import { chatVoiceBridge, VoicePlaybackOverlay } from "@/modules/voice";

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

function VoiceRedirect() {
  const { "*": rest } = useParams();
  return <Navigate to={`/configurations/voice${rest ? `/${rest}` : ""}`} replace />;
}

export function App() {
  const location = useLocation();
  useGlobalChatSync();
  useVoiceSync();
  useMicSync();

  useEffect(() => {
    chatVoiceBridge.handleRouteChange(location.pathname);
  }, [location.pathname]);

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
          <Route path="/tools" element={<Navigate to="/tools/news" replace />} />
          <Route path="/tools/*" element={<ToolsPage />} />
          <Route path="/user" element={<UserPage />} />
          <Route path="/configurations/*" element={<ConfigurationsPage />} />
          <Route path="/activity" element={<Navigate to="/configurations/activity-control" replace />} />
          <Route path="/activity/*" element={<ActivityRedirect />} />
          <Route path="/capture" element={<Navigate to="/configurations/activity-control" replace />} />
          <Route path="/capture/*" element={<ActivityRedirect />} />
          <Route path="/ai-configs" element={<Navigate to="/configurations/ai-config" replace />} />
          <Route path="/ai-configs/*" element={<AiConfigsRedirect />} />
          <Route path="/voice" element={<Navigate to="/configurations/voice" replace />} />
          <Route path="/voice/*" element={<VoiceRedirect />} />
          <Route path="/microphone" element={<Navigate to="/configurations/voice" replace />} />
          <Route path="/microphone/*" element={<VoiceRedirect />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/mira" replace />} />
        </Routes>
      </main>

      <VoicePlaybackOverlay />
    </div>
  );
}

export default App;
