import type { FC } from "react";
import { Network } from "lucide-react";

export const MessageBrokerDataPage: FC = () => {
  return (
    <div
      id="history-subpage-message-broker-data"
      className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden select-none"
    >
      {/* Subtle ambient lighting */}
      <div className="absolute w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="flex flex-col items-center gap-4 text-center z-10 px-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-[0_0_25px_rgba(168,85,247,0.15)] mb-1">
          <Network className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          Message Broker Data
        </h1>
      </div>
    </div>
  );
};

export default MessageBrokerDataPage;
