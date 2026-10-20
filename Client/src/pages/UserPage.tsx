import type { FC } from "react";
import { User } from "lucide-react";

export const UserPage: FC = () => {
  return (
    <div
      id="page-content-user"
      className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden select-none"
    >
      {/* Ambient background glow */}
      <div className="absolute w-[450px] h-[450px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="flex flex-col items-center gap-4 text-center z-10 px-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.15)] mb-2">
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          User
        </h1>
      </div>
    </div>
  );
};
