import { useState, useEffect, type FC } from "react";
import { FileText, RefreshCw, Copy, Check, Mic, Clock } from "lucide-react";
import { getStoredTranscriptions, type TranscribeRecord } from "@/utils/transcribe";
import { toast } from "@/components";

interface MicrophoneTranscriptionsCardProps {
  isOn: boolean;
}

export const MicrophoneTranscriptionsCard: FC<MicrophoneTranscriptionsCardProps> = ({ isOn }) => {
  const [transcriptions, setTranscriptions] = useState<TranscribeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchRecords = async (showFeedback: boolean = false) => {
    setIsLoading(true);
    try {
      const records = await getStoredTranscriptions();
      setTranscriptions(records.slice().reverse()); // Show newest first
      if (showFeedback) {
        toast.success(`Refreshed ${records.length} transcription record${records.length === 1 ? "" : "s"}`);
      }
    } catch {
      if (showFeedback) {
        toast.error("Failed to load transcriptions");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords(false);

    // Listen to real-time speech events
    const handleNewTranscription = (e: any) => {
      const record = e.detail as TranscribeRecord;
      if (record && record.text) {
        setTranscriptions((prev) => {
          if (prev.some((p) => p.text === record.text && p.time === record.time)) {
            return prev;
          }
          return [record, ...prev];
        });
      }
    };

    const handleGlobalRefresh = () => {
      fetchRecords(false);
    };

    window.addEventListener("mira-transcription", handleNewTranscription);
    window.addEventListener("mira:refresh-transcriptions", handleGlobalRefresh);
    return () => {
      window.removeEventListener("mira-transcription", handleNewTranscription);
      window.removeEventListener("mira:refresh-transcriptions", handleGlobalRefresh);
    };
  }, []);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Transcription copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div
      id="microphone-transcriptions-card"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-xl shadow-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white">
                Transcribed Voice Text
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                utils/transcribe.json
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Live speech-to-text transcriptions captured via Web Speech API and persisted locally
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOn && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Live Listening</span>
            </span>
          )}

          <button
            type="button"
            id="refresh-transcriptions-btn"
            onClick={() => fetchRecords(true)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-zinc-800/80 hover:bg-zinc-700/80 text-xs text-zinc-200 transition-colors cursor-pointer"
            title="Refresh transcription log"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {transcriptions.length === 0 ? (
        <div className="p-8 rounded-xl border border-white/[0.04] bg-zinc-950/40 text-center space-y-2">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-zinc-800/80 text-zinc-500">
            <Mic className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-zinc-300">No transcriptions recorded yet</p>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            {isOn
              ? "Microphone is ON! Start speaking, and your voice will be transcribed and displayed here in real time."
              : "Turn on the microphone above, then speak. All speech will be transcribed and saved to utils/transcribe.json."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {transcriptions.map((item, idx) => (
            <div
              key={`${item.time}-${idx}`}
              className="group flex items-start justify-between gap-4 p-3.5 rounded-xl border border-white/[0.06] bg-zinc-950/50 hover:bg-zinc-950/80 hover:border-cyan-500/30 transition-all"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>{new Date(item.time).toLocaleTimeString()}</span>
                  <span className="text-zinc-600">•</span>
                  <span>{new Date(item.time).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed font-sans">{item.text}</p>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(item.text, idx)}
                title="Copy transcription"
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-all shrink-0"
              >
                {copiedIndex === idx ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
