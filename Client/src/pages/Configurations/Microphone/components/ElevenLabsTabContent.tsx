import type { FC } from "react";
import type { VoiceModel } from "@/services";
import { ElevenLabsOverviewCard } from "./ElevenLabsOverviewCard";
import { ElevenLabsApiKeyList } from "./ElevenLabsApiKeyList";
import { ElevenLabsAddApiKeyCard } from "./ElevenLabsAddApiKeyCard";

interface ElevenLabsTabContentProps {
  model: VoiceModel | null;
  onScrollToAdd: () => void;
  onSetAsActive: (index: number) => Promise<void>;
  onUpdateKey: (index: number, updatedKeyValue: string) => Promise<void>;
  onRemoveKey: (index: number) => Promise<void>;
  onAddKey: (newKey: string, makeActive: boolean) => Promise<void>;
  isUpdating: boolean;
}

export const ElevenLabsTabContent: FC<ElevenLabsTabContentProps> = ({
  model,
  onScrollToAdd,
  onSetAsActive,
  onUpdateKey,
  onRemoveKey,
  onAddKey,
  isUpdating,
}) => {
  const activeKeys = model?.keys || [];
  const currentKeyIndex = model?.current_key ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <ElevenLabsOverviewCard
        model={model}
        onAddNewKeyClick={onScrollToAdd}
      />

      <ElevenLabsApiKeyList
        keys={activeKeys}
        currentKeyIndex={currentKeyIndex}
        onSetAsActive={onSetAsActive}
        onUpdateKey={onUpdateKey}
        onRemoveKey={onRemoveKey}
        onAddNewKeyClick={onScrollToAdd}
        disabled={isUpdating}
      />

      <ElevenLabsAddApiKeyCard
        onAddKey={onAddKey}
        existingKeys={activeKeys}
        disabled={isUpdating}
      />
    </div>
  );
};
