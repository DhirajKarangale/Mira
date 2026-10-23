import type { FC } from "react";
import { MessageSquare, Plus, Search, Sparkles, MessageCircle } from "lucide-react";
import { toast } from "@/components";

export const ChatsPage: FC = () => {
  return (
    <div
      id="page-content-chats"
      className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden select-none bg-gradient-to-b from-[#080c14] via-[#090e18] to-[#04070d] text-zinc-100"
    >
      <div className="absolute w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[130px] pointer-events-none -z-10" />
      <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="flex flex-col items-center gap-6 text-center z-10 px-6 max-w-lg">
        <div className="relative">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
            <MessageSquare className="w-8 h-8" />
          </div>
          <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-6 h-6 rounded-lg bg-cyan-500 text-zinc-950 shadow-md">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Chats
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
              Active Hub
            </span>
          </div>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Manage your AI assistant conversations, review interaction threads, and start new dialogue sessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            id="btn-new-chat"
            onClick={() => toast.info("New chat dialogue session initiated.", { title: "Chats Hub" })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            id="btn-search-chats"
            onClick={() => toast.info("Search index is syncing with local chat store.", { title: "Search Threads" })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-white/[0.08] transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Search className="w-4 h-4 text-zinc-400" />
            <span>Search Threads</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono pt-4">
          <MessageCircle className="w-3.5 h-3.5 text-zinc-600" />
          <span>No active chat selected</span>
        </div>
      </div>
    </div>
  );
};

export default ChatsPage;
