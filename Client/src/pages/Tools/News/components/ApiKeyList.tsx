import type { FC } from "react";
import { Key, Plus } from "lucide-react";
import { ApiKeyItem } from "./ApiKeyItem";

interface ApiKeyListProps {
  keys: string[];
  currentKeyIndex: number;
  onSetAsActive: (index: number) => void;
  onUpdateKey: (index: number, newKey: string) => Promise<void>;
  onRemoveKey: (index: number) => Promise<void>;
  onAddNewKeyClick: () => void;
  disabled?: boolean;
}

export const ApiKeyList: FC<ApiKeyListProps> = ({
  keys,
  currentKeyIndex,
  onSetAsActive,
  onUpdateKey,
  onRemoveKey,
  onAddNewKeyClick,
  disabled = false,
}) => {
  if (keys.length === 0) {
    return (
      <div
        id="empty-keys-state-gnews"
        className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 p-8 sm:p-12 text-center backdrop-blur-xl shadow-xl flex flex-col items-center justify-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 text-zinc-400 flex items-center justify-center mb-4 shadow-inner">
          <Key className="w-7 h-7 text-zinc-500" />
        </div>

        <h3 className="text-base font-bold text-white mb-1.5">
          No API Keys Configured for GNews
        </h3>
        <p className="text-xs text-zinc-400 max-w-md mb-5 leading-relaxed">
          Add your GNews API key to enable live breaking headlines, scheduled briefings, and topic searches through MIRA.
        </p>

        <button
          type="button"
          onClick={onAddNewKeyClick}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add GNews API Key</span>
        </button>
      </div>
    );
  }

  return (
    <div
      id="keys-list-container-gnews"
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/30 backdrop-blur-xl shadow-xl overflow-hidden"
    >
      <div className="p-6 border-b border-white/[0.06] bg-zinc-950/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white tracking-tight">
                Configured Credentials
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/[0.06] text-zinc-300 border border-white/10">
                {keys.length} {keys.length === 1 ? "Key" : "Keys"}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Manage, reveal, edit, rotate, and revoke stored API keys for GNews
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddNewKeyClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 cursor-pointer transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Key</span>
        </button>
      </div>

      <div className="p-6 space-y-3">
        {keys.map((key, idx) => (
          <ApiKeyItem
            key={`gnews-key-${idx}`}
            index={idx}
            apiKey={key}
            isActive={idx === currentKeyIndex}
            onSetAsActive={onSetAsActive}
            onUpdateKey={onUpdateKey}
            onRemoveKey={onRemoveKey}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
};
