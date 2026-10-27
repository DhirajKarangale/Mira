/**
 * Global Wake-Word ("Mira") Conversational Hook & Active Voice Chat Manager
 *
 * Rules:
 * 1. 2-3 Second Speech Gap Accumulator:
 *    - When the user is talking, accumulates speech until a 2.5s silence gap is detected,
 *      then sends the completed thought to the backend via sockets/API.
 * 2. Active Chat Screen Continuity:
 *    - If the user is on the active chat screen (/chats with an open session), asking with "Mira"
 *      or speaking in the conversation continues in that SAME session without creating duplicate chats.
 * 3. Inactive Chat Screen Wake-Word Trigger:
 *    - When not on the active chat screen, speaking the trigger word "Mira" triggers a brand new
 *      special chat session, navigates to /chats, and sends the message.
 * 4. Single Voice Model:
 *    - Fixed exclusively to the single verified voice model (Sarah / EXAVITQu4vr4xnSDxMaL).
 *      No variable voice selection options.
 * 5. Echo Prevention:
 *    - Disables microphone input during LLM formulation and TTS playback.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { transcribeManager, type TranscribeRecord, recordTranscription } from "@/utils/transcribe";
import { ttsService } from "@/utils/ttsService";
import { DEFAULT_VOICE_ID } from "@/utils/ttsVoices";
import { engineService } from "@/services/engine.service";
import { useChatStore } from "@/store/useChatStore";
import { toast } from "@/components";

// Wake-word matcher regex: matches "mira", "meera", "mera", "myra"
const WAKE_WORD_REGEX = /\b(mira|meera|mera|myra)\b/i;

// Idle timeout for an ongoing voice conversation (60 seconds)
const CONVERSATION_IDLE_TIMEOUT_MS = 60000;

// Speech gap before sending accumulated thought to backend (2.5 seconds)
const SPEECH_GAP_DELAY_MS = 2500;

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
  const location = useLocation();
  const navigate = useNavigate();

  const locationRef = useRef(location);
  locationRef.current = location;

  const isSpeakingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Active voice chat session ID
  const activeVoiceSessionIdRef = useRef<string | null>(null);
  const lastVoiceActivityTimeRef = useRef<number>(0);

  // Speech gap buffer: accumulates speech segments until the user pauses for 2-3s
  const pendingBufferRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<any>(null);

  useEffect(() => {
    const processFinalSpeech = async (speechText: string) => {
      const fullText = speechText.trim();
      if (!fullText) return;

      // 1. If currently speaking or processing, drop to prevent echo
      if (isSpeakingRef.current || isProcessingRef.current || transcribeManager.getIsMutedDuringTTS()) {
        return;
      }

      const now = Date.now();
      const hasWakeWord = WAKE_WORD_REGEX.test(fullText);

      // Check whether user is currently on the active chat screen
      const currentPath = locationRef.current.pathname;
      const selectedSessionId = useChatStore.getState().selectedSessionId;
      const isChatRoute = currentPath.startsWith("/chats");
      const isOnActiveChat = isChatRoute && Boolean(selectedSessionId);

      const isWithinActiveConversation =
        Boolean(activeVoiceSessionIdRef.current) &&
        now - lastVoiceActivityTimeRef.current < CONVERSATION_IDLE_TIMEOUT_MS;

      // Rule:
      // - If NOT on active chat: MUST have trigger word "Mira" to start a new chat
      // - If ON active chat: triggers if "Mira" is spoken OR continuing active conversation
      if (!isOnActiveChat && !hasWakeWord) {
        return;
      }
      if (isOnActiveChat && !hasWakeWord && !isWithinActiveConversation) {
        return;
      }

      // Determine query: strip wake-word prefix if present
      const userQuery = hasWakeWord
        ? extractWakeWordQuery(fullText)
        : fullText.trim();

      if (!userQuery) return;

      // Save to transcribe.json
      recordTranscription(fullText, new Date().toISOString(), "voice").catch(() => {});

      // Session Management:
      // Requirement 3: If on active chat, continue in the same session!
      // Requirement 4: If NOT on active chat screen and trigger word is heard, create a new chat!
      let targetSessionId: string;
      let isNewChat = false;

      if (isOnActiveChat && selectedSessionId) {
        // Continue on the active session
        targetSessionId = selectedSessionId;
        activeVoiceSessionIdRef.current = targetSessionId;
        console.log(`[Mira Voice] User is on active chat screen. Continuing in same session: ${targetSessionId}`);
      } else {
        // Not on active chat screen: create a brand new special chat!
        isNewChat = true;
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

        // Register new session in global chat store
        useChatStore.getState().setCachedSessions((prev) => [
          newSession,
          ...prev.filter((s) => s.session_id !== targetSessionId),
        ]);
        useChatStore.getState().setSelectedSessionId(targetSessionId);
        useChatStore.getState().setSkipInitialFetchSessionId(targetSessionId);

        // Bring the user to the chats screen so they see the conversation
        navigate("/chats");
        console.log(`[Mira Voice] Triggered NEW CHAT from inactive screen: ${targetSessionId} ("${chatTitle}")`);
      }

      const finalSessionId: string = targetSessionId;
      lastVoiceActivityTimeRef.current = Date.now();

      // Mute microphone capture during LLM call & TTS playback to prevent echo loopback
      isProcessingRef.current = true;
      transcribeManager.setMutedDuringTTS(true);

      // Optimistically append user's speech
      const userMsgId = generateVoiceId();
      useChatStore.getState().addOptimisticMessage(finalSessionId, {
        id: userMsgId,
        session_id: finalSessionId,
        role: "user",
        content: userQuery,
        created_at: new Date().toISOString(),
      });

      toast.info(`"${userQuery}"`, {
        title: isNewChat ? "🎙️ Mira (New Chat)" : "🎙️ Mira Voice",
      });

      // Persist user message to Vault in background
      engineService.sendChatMessage({
        session_id: finalSessionId,
        content: userQuery,
        role: "user",
        chat_name: isNewChat ? `🎙️ ${userQuery.slice(0, 30)}` : undefined,
        generate_ai_reply: false,
      }).catch((err) => console.warn("[Voice] sendChatMessage save error:", err));

      // Query LLM
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

      // Optimistically append AI's response to the active session
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

      // Speak response using the single fixed voice model
      isSpeakingRef.current = true;
      toast.success(
        replyText.slice(0, 85) + (replyText.length > 85 ? "..." : ""),
        { title: "🎙️ Mira Responding" }
      );

      const unfreezeMic = () => {
        isSpeakingRef.current = false;
        lastVoiceActivityTimeRef.current = Date.now();
        // Unmute microphone: WebSocket and audio capture stayed active
        transcribeManager.setMutedDuringTTS(false);
      };

      // Safety timer: maximum 25s TTS timeout
      const safetyTimer = setTimeout(unfreezeMic, 25000);

      // Single verified voice model (Sarah / EXAVITQu4vr4xnSDxMaL)
      ttsService.speak(replyText, {
        voiceId: DEFAULT_VOICE_ID,
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

    const handleVoiceHeard = (e: any) => {
      const record: TranscribeRecord = e.detail;
      if (!record || !record.text || record.source === "chat") return;

      // Discard if currently speaking or muted
      if (isSpeakingRef.current || isProcessingRef.current || transcribeManager.getIsMutedDuringTTS()) {
        return;
      }

      // Accumulate speech into buffer
      pendingBufferRef.current.push(record.text);

      // Reset 2.5s silence gap timer (Requirement 2: gap of 2-3 sec before sending to backend)
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      silenceTimerRef.current = setTimeout(() => {
        const fullSpeech = pendingBufferRef.current.join(" ").trim();
        pendingBufferRef.current = [];
        if (fullSpeech) {
          processFinalSpeech(fullSpeech);
        }
      }, SPEECH_GAP_DELAY_MS);
    };

    window.addEventListener("mira-voice-heard", handleVoiceHeard);

    return () => {
      window.removeEventListener("mira-voice-heard", handleVoiceHeard);
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [navigate]);
}
