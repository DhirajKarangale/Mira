/**
 * Global Wake-Word ("Mira") Conversational Hook & Active Voice Chat Manager
 *
 * Flow:
 * 1. Continuous Transcription:
 *    - While microphone is turned ON, ElevenLabs Scribe WebSocket remains actively connected
 *      and streaming throughout the user session.
 * 2. Wake-Word "Mira" -> Special New Chat:
 *    - When the user speaks the wake word "Mira" (or phonetic variants "Meera", "Mera", "Myra"),
 *      it triggers a brand new special chat session in the app.
 *    - It selects this new session in the global chat store (`useChatStore`), adds it to the
 *      sidebar list, and appends the user's speech.
 * 3. Continuous Multi-Turn Append in the Same Chat:
 *    - After "Mira" starts the conversation, all next transcriptions continue in that SAME chat session.
 *    - User utterances and AI answers keep appending into the same conversation thread without creating
 *      new chats each turn.
 *    - If the user explicitly speaks the wake word "Mira" again (or after 60s idle timeout),
 *      it triggers a new special chat session.
 * 4. Echo Prevention with Continuous Streaming:
 *    - Uses `transcribeManager.setMutedDuringTTS(true)` only while TTS is actively outputting sound.
 *    - Does NOT tear down the WebSocket, keeping transcription active throughout the entire session.
 */

import { useEffect, useRef } from "react";
import { transcribeManager, type TranscribeRecord, recordTranscription } from "@/utils/transcribe";
import { ttsService } from "@/utils/ttsService";
import { engineService } from "@/services/engine.service";
import { useChatStore } from "@/store/useChatStore";
import { toast } from "@/components";

// Wake-word matcher regex: matches "mira", "meera", "mera", "myra"
const WAKE_WORD_REGEX = /\b(mira|meera|mera|myra)\b/i;

// Idle timeout for an active voice conversation (60 seconds)
const CONVERSATION_IDLE_TIMEOUT_MS = 60000;

// Strips wake-word prefixes: "hey mira", "hello meera", "mira," etc.
function extractWakeWordQuery(rawText: string): string {
  const cleaned = rawText
    .replace(/^(?:(?:hey|hi|hello|ok|okay)\s+)?(?:mira|meera|mera|myra)[,:!?-]?\s*/i, "")
    .replace(/\b(?:mira|meera|mera|myra)\b/gi, "")
    .trim();

  return cleaned || "Hello Mira";
}

function generateVoiceId(): string {
  return "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
}

export function useMiraWakeWord() {
  const isSpeakingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const lastProcessedTextRef = useRef<string>("");
  const lastProcessedTimeRef = useRef<number>(0);

  // Active voice chat session ID that receives ongoing conversation
  const activeVoiceSessionIdRef = useRef<string | null>(null);
  const lastVoiceActivityTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleVoiceHeard = async (e: any) => {
      const record: TranscribeRecord = e.detail;
      if (!record || !record.text || record.source === "chat") return;

      // 1. If currently synthesizing or formulating, discard to prevent echo
      if (isSpeakingRef.current || isProcessingRef.current || transcribeManager.getIsMutedDuringTTS()) {
        return;
      }

      const now = Date.now();
      const hasWakeWord = WAKE_WORD_REGEX.test(record.text);
      const isWithinActiveConversation =
        Boolean(activeVoiceSessionIdRef.current) &&
        now - lastVoiceActivityTimeRef.current < CONVERSATION_IDLE_TIMEOUT_MS;

      // Only trigger if wake-word "Mira" is present OR we are actively in an ongoing conversation
      if (!hasWakeWord && !isWithinActiveConversation) {
        return;
      }

      // Debounce duplicate transcripts within 1500ms
      if (
        record.text.toLowerCase() === lastProcessedTextRef.current.toLowerCase() &&
        now - lastProcessedTimeRef.current < 1500
      ) {
        return;
      }
      lastProcessedTextRef.current = record.text;
      lastProcessedTimeRef.current = now;

      // Determine query: strip wake word if present, otherwise take spoken words
      const userQuery = hasWakeWord
        ? extractWakeWordQuery(record.text)
        : record.text.trim();

      if (!userQuery) return;

      // Save to transcribe.json
      recordTranscription(record.text, new Date().toISOString(), "voice").catch(() => {});

      // 2. Session Management:
      // If user hit the word "mira" -> TRIGGER A SPECIAL NEW CHAT!
      // Otherwise, continue in the same chat and keep appending to it!
      let targetSessionId = activeVoiceSessionIdRef.current;
      const isTriggeringNewChat = hasWakeWord || !targetSessionId;

      if (isTriggeringNewChat || !targetSessionId) {
        targetSessionId = `voice-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        activeVoiceSessionIdRef.current = targetSessionId;

        const chatTitle = userQuery.length > 30 ? `${userQuery.slice(0, 30)}...` : userQuery;
        const nowIso = new Date().toISOString();

        const newSession = {
          session_id: targetSessionId,
          chat_name: `🎙️ ${chatTitle}`,
          latest_created_at: nowIso,
          created_at: nowIso,
          message_count: 1,
        };

        // Instantly register new session in global chat store
        useChatStore.getState().setCachedSessions((prev) => [
          newSession,
          ...prev.filter((s) => s.session_id !== targetSessionId),
        ]);
        useChatStore.getState().setSelectedSessionId(targetSessionId);
        useChatStore.getState().setSkipInitialFetchSessionId(targetSessionId);

        console.log(`[Mira Voice] Triggered SPECIAL NEW CHAT session: ${targetSessionId} ("${chatTitle}")`);
      } else {
        console.log(`[Mira Voice] Continuing conversation in SAME CHAT session: ${targetSessionId}`);
      }

      const finalSessionId: string = targetSessionId;
      lastVoiceActivityTimeRef.current = Date.now();

      // 3. Mute microphone capture during LLM call & TTS playback to prevent hearing itself
      isProcessingRef.current = true;
      transcribeManager.setMutedDuringTTS(true);

      // 4. Optimistically append user's speech to the active chat session
      const userMsgId = generateVoiceId();
      useChatStore.getState().addOptimisticMessage(finalSessionId, {
        id: userMsgId,
        session_id: finalSessionId,
        role: "user",
        content: userQuery,
        created_at: new Date().toISOString(),
      });

      toast.info(`"${userQuery}"`, {
        title: isTriggeringNewChat ? "🎙️ Mira (New Chat)" : "🎙️ Mira Voice",
      });

      // Persist user message to Vault in background
      engineService.sendChatMessage({
        session_id: finalSessionId,
        content: userQuery,
        role: "user",
        chat_name: isTriggeringNewChat ? `🎙️ ${userQuery.slice(0, 30)}` : undefined,
        generate_ai_reply: false,
      }).catch((err) => console.warn("[Voice] sendChatMessage save error:", err));

      // 5. Query LLM
      let replyText = "";
      try {
        const llmRes = await engineService.callLLM(userQuery, "chat");
        if (llmRes?.response && !llmRes.response.includes("AI request could not be completed")) {
          replyText = llmRes.response;
        } else {
          replyText = "I heard your request. How can I assist you further?";
        }
      } catch (err) {
        console.warn("[Voice] LLM call error:", err);
        replyText = "I received your request, but had trouble formulating a response.";
      } finally {
        isProcessingRef.current = false;
      }

      // 6. Optimistically append AI's response to the active chat session
      const aiMsgId = generateVoiceId();
      useChatStore.getState().addOptimisticMessage(finalSessionId, {
        id: aiMsgId,
        session_id: finalSessionId,
        role: "ai",
        content: replyText,
        created_at: new Date().toISOString(),
      });

      // Persist AI message to Vault in background
      engineService.sendChatMessage({
        session_id: finalSessionId,
        content: replyText,
        role: "ai",
        generate_ai_reply: false,
      }).catch(() => {});

      // 7. Speak response via ElevenLabs TTS
      isSpeakingRef.current = true;
      toast.success(
        replyText.slice(0, 85) + (replyText.length > 85 ? "..." : ""),
        { title: "🎙️ Mira Responding" }
      );

      const storedVoice = typeof window !== "undefined" ? localStorage.getItem("mira_selected_tts_voice_id") : null;
      const voiceId =
        storedVoice && storedVoice !== "Be3X8pg7kLN4vyyMC3QN" && storedVoice !== "m7GHBtY0UEqljrKQw2JH"
          ? storedVoice
          : "EXAVITQu4vr4xnSDxMaL";

      const unfreezeMic = () => {
        isSpeakingRef.current = false;
        lastVoiceActivityTimeRef.current = Date.now();
        // Unmute microphone: WebSocket and stream stayed connected, ready immediately for next user speech!
        transcribeManager.setMutedDuringTTS(false);
      };

      // Safety timer: maximum 25s TTS timeout
      const safetyTimer = setTimeout(unfreezeMic, 25000);

      ttsService.speak(replyText, {
        voiceId,
        onFinish: () => {
          clearTimeout(safetyTimer);
          unfreezeMic();
        },
        onError: () => {
          clearTimeout(safetyTimer);
          unfreezeMic();
        },
      });
    };

    window.addEventListener("mira-voice-heard", handleVoiceHeard);

    return () => {
      window.removeEventListener("mira-voice-heard", handleVoiceHeard);
    };
  }, []);
}
