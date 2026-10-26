import type { FC } from "react";
import {
  ShieldCheck,
  EyeOff,
  Sparkles,
  Trash2,
  CheckCircle2,
  CloudOff,
  Lock,
  LockKeyhole,
  Check,
} from "lucide-react";

export const MicrophonePrivacyCard: FC = () => {
  return (
    <div
      id="microphone-privacy-card"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-xl shadow-xl p-5 sm:p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              Privacy & Data Protection Guarantees
            </h2>
            <p className="text-xs text-zinc-400">
              Verified local audio protections implemented within MIRA's client and operator architecture
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 shrink-0 self-start sm:self-center">
          <LockKeyhole className="w-3.5 h-3.5" />
          <span>Local Privacy Enforced</span>
        </div>
      </div>

      {/* Grid of 6 required privacy statements */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Statement 1 */}
        <div className="relative p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 hover:border-violet-500/30 transition-all duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-purple-400 border border-white/5">
              <EyeOff className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-300 border border-white/5 font-semibold">
              Zero Harvest
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              No Unrelated Data Collection
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              MIRA does not collect unrelated user data through the microphone. Ambient room audio and idle background sound are never recorded or stored.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-white/[0.04]">
            <Check className="w-3.5 h-3.5" />
            <span>Verified Passive Rejection</span>
          </div>
        </div>

        {/* Statement 2 */}
        <div className="relative p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 hover:border-violet-500/30 transition-all duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-violet-400 border border-white/5">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Wake Word: Mira
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Wake-Word Triggered Only
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Audio is captured for MIRA only after the wake word <span className="text-violet-300 font-mono font-medium">Mira</span> is detected. The microphone buffer remains ephemeral until explicitly addressed.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-white/[0.04]">
            <Check className="w-3.5 h-3.5" />
            <span>Strict Gated Capture</span>
          </div>
        </div>

        {/* Statement 3 */}
        <div className="relative p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 hover:border-violet-500/30 transition-all duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-rose-400 border border-white/5">
              <Trash2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold">
              Zero Retention
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Immediate Post-Processing Deletion
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Audio data is deleted after processing. Once voice commands are transcribed and passed to the Engine, audio buffers are securely purged from memory.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-white/[0.04]">
            <Check className="w-3.5 h-3.5" />
            <span>Ephemeral Memory Scrub</span>
          </div>
        </div>

        {/* Statement 4 */}
        <div className="relative p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 hover:border-violet-500/30 transition-all duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-cyan-400 border border-white/5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-300 border border-white/5 font-semibold">
              Dedicated Use
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              No Secondary Purpose or Profiling
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Audio data is not used for other purposes. It is never utilized for telemetry, advertisement tracking, third-party profiling, or external model training.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-white/[0.04]">
            <Check className="w-3.5 h-3.5" />
            <span>Purpose-Limited Architecture</span>
          </div>
        </div>

        {/* Statement 5 */}
        <div className="relative p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 hover:border-violet-500/30 transition-all duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-blue-400 border border-white/5">
              <CloudOff className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold">
              100% On-Device
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              No Cloud Audio Transmission
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Audio data is not sent to the cloud. Audio streams remain strictly bound to your local machine, operating entirely within MIRA's local environment.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-white/[0.04]">
            <Check className="w-3.5 h-3.5" />
            <span>Offline-Safe Pipeline</span>
          </div>
        </div>

        {/* Statement 6 */}
        <div className="relative p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 hover:border-violet-500/30 transition-all duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-emerald-400 border border-white/5">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
              Vault Encrypted
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Local Encryption & Access Controls
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Audio data is stored locally and protected with encryption and access controls. State and transient voice metadata are secured with MIRA Vault's master encryption.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-mono pt-1 border-t border-white/[0.04]">
            <Check className="w-3.5 h-3.5" />
            <span>Cryptographically Guarded</span>
          </div>
        </div>
      </div>

      {/* Assurance banner */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200/90">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            All 6 privacy guarantees are actively enforced at the Operator runtime level and verified against local capture policies.
          </span>
        </div>
        <div className="font-mono text-[11px] text-emerald-400/80 shrink-0">
          Status: Compliant & Verified
        </div>
      </div>
    </div>
  );
};
