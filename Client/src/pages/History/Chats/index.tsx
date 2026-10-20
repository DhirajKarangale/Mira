import type { FC } from "react";
import { MessageSquare } from "lucide-react";

export const ChatsPage: FC = () => {
  return (
    <div
      id="history-subpage-chats"
      className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden select-none"
    >
      {/* Subtle ambient lighting */}
      <div className="absolute w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="flex flex-col items-center gap-4 text-center z-10 px-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.15)] mb-1">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          Chats
        </h1>
      </div>
    </div>
  );
};

export default ChatsPage;
