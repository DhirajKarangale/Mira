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
import { useLocation } from "react-router-dom";
import { transcribeManager, type TranscribeRecord, recordTranscription } from "@/utils/transcribe";
import { ttsService } from "@/utils/ttsService";
import { DEFAULT_VOICE_ID } from "@/utils/ttsVoices";
import { engineService } from "@/services/engine.service";
import { useChatStore } from "@/store/useChatStore";
import { toast } from "@/components";

// Wake-word matcher regex: matches "mira", "meera", "mera", "myra", "mirah", "mirror", "amira", "meira", "vera", and transliterations
const WAKE_WORD_REGEX = /(?:^|\b)(mira|meera|mera|myra|mirah|mirror|amira|meira|vera|मेरा|मीरा|미라)(?:\b|$)/i;

// Conversational awake window (8 seconds): user can reply within 3-8s without repeating the wake-word
const CONVERSATION_AWAKE_TIMEOUT_MS = 8000;
// Natural speech pause (1.5 seconds) before concluding user thought
const SPEECH_GAP_DELAY_MS = 1500;

// Strips wake-word prefixes: "hey mira", "hello meera", "mira," etc.
function extractWakeWordQuery(rawText: string): string {
  const cleaned = rawText
    .replace(/^(?:(?:hey|hi|hello|ok|okay)\s+)?(?:mira|meera|mera|myra|mirah|mirror|amira|meira|vera|मेरा|मीरा|미라)[,:!?-]?\s*/i, "")
    .replace(/(?:^|\b)(?:mira|meera|mera|myra|mirah|mirror|amira|meira|vera|मेरा|मीरा|미라)(?:\b|$)/gi, "")
    .trim();

  return cleaned || "Hello Mira";
}

function generateVoiceId(): string {
  return "temp-v-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
}

export function useMiraWakeWord() {
  const location = useLocation();

  const locationRef = useRef(location);
  locationRef.current = location;

  const isSpeakingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Active voice chat session ID & conversational awake state
  const activeVoiceSessionIdRef = useRef<string | null>(null);
  const isAwakeSessionRef = useRef<boolean>(false);
  const awakeTimerRef = useRef<any>(null);

  // Speech gap buffer: accumulates speech segments until the user pauses for 1.5s
  const pendingBufferRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<any>(null);
  const partialFallbackTimerRef = useRef<any>(null);
  const latestPartialRef = useRef<string>("");
  const lastProcessedTextRef = useRef<string>("");
  const lastProcessedTimeRef = useRef<number>(0);

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
      const isAwake = isAwakeSessionRef.current && Boolean(activeVoiceSessionIdRef.current);

      // Rule:
      // - If session is currently awake: process speech continuously as follow-up in same chat
      // - If session is NOT awake: ONLY process if user mentions "Mira" (starts new chat)
      if (!isAwake && !hasWakeWord) {
        return;
      }

      // Deduplicate rapid duplicate triggers of the SAME processed text within 2.5s
      if (
        fullText.toLowerCase() === lastProcessedTextRef.current.toLowerCase() &&
        now - lastProcessedTimeRef.current < 2500
      ) {
        return;
      }
      lastProcessedTextRef.current = fullText;
      lastProcessedTimeRef.current = now;

      // Clear the awake countdown timer immediately while processing this turn
      if (awakeTimerRef.current) {
        clearTimeout(awakeTimerRef.current);
        awakeTimerRef.current = null;
      }
      isAwakeSessionRef.current = false;
      useChatStore.getState().setIsVoiceAwake(false);

      // Determine query: strip wake-word prefix if present
      const userQuery = hasWakeWord
        ? extractWakeWordQuery(fullText)
        : fullText.trim();

      if (!userQuery) return;

      // Save to transcribe.json
      recordTranscription(fullText, new Date().toISOString(), "voice").catch(() => {});

      // Session Management:
      let targetSessionId: string;
      let isNewChat = false;

      if (isAwake && activeVoiceSessionIdRef.current) {
        // Continuous conversational follow-up in the same active session
        targetSessionId = activeVoiceSessionIdRef.current;
        isNewChat = false;
        console.log(`[Mira Voice] Continuing active conversation in same chat: ${targetSessionId}`);
      } else {
        // Brand new voice chat session triggered by "Mira"
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

        // 1. Optimistically append user's speech message FIRST
        const userMsgId = generateVoiceId();
        useChatStore.getState().addOptimisticMessage(targetSessionId, {
          id: userMsgId,
          session_id: targetSessionId,
          role: "user",
          content: userQuery,
          created_at: new Date().toISOString(),
        });

        // 2. Register new session in global chat store
        useChatStore.getState().setCachedSessions((prev) => [
          newSession,
          ...prev.filter((s) => s.session_id !== targetSessionId),
        ]);
        useChatStore.getState().setSelectedSessionId(targetSessionId);
        useChatStore.getState().setSkipInitialFetchSessionId(targetSessionId);

        console.log(`[Mira Voice] Mentioned Mira -> Created NEW CHAT session: ${targetSessionId} ("${chatTitle}")`);
      }

      const finalSessionId: string = targetSessionId;

      // Mute microphone capture during LLM call & TTS playback to prevent echo loopback
      isProcessingRef.current = true;
      transcribeManager.setMutedDuringTTS(true);

      // If this was continuing an existing chat, append the optimistic message now
      if (!isNewChat) {
        const userMsgId = generateVoiceId();
        useChatStore.getState().addOptimisticMessage(finalSessionId, {
          id: userMsgId,
          session_id: finalSessionId,
          role: "user",
          content: userQuery,
          created_at: new Date().toISOString(),
        });
      }

      toast.info(`"${userQuery}"`, {
        title: isNewChat ? "🎙️ Mira (New Chat)" : "🎙️ Mira (Continuing)",
      });

      // Persist user message to Vault in background
      engineService.sendChatMessage({
        session_id: finalSessionId,
        content: userQuery,
        role: "user",
        chat_name: isNewChat ? `🎙️ ${userQuery.slice(0, 30)}` : undefined,
        generate_ai_reply: false,
      }).catch((err) => console.warn("[Voice] sendChatMessage save error:", err));

      // Contextual multi-turn history: Retrieve previous turns from session cache so Mira replies based on the last message
      const sessionCache = useChatStore.getState().sessionMessagesCache[finalSessionId] || [];
      const priorTurns = sessionCache
        .filter((m) => m && m.content && m.content.trim())
        .slice(0, -1) // Exclude current user query just appended
        .slice(-8);   // Take up to 8 prior turns for conversational context

      let promptWithContext: string;
      if (priorTurns.length > 0) {
        const historyText = priorTurns
          .map((m) => `${m.role === "user" ? "User" : "Mira"}: ${m.content.trim()}`)
          .join("\n");

        promptWithContext = `You are Mira, a personal AI voice assistant. Respond conversationally, concisely, and naturally for spoken conversation (1-3 sentences maximum).
Pay close attention to the conversation history and the user's latest follow-up question below, replying directly based on the context of the last message.

Conversation History:
${historyText}

User: ${userQuery}
Mira:`;
      } else {
        promptWithContext = `You are Mira, a personal AI voice assistant. Respond conversationally, concisely, and naturally for spoken conversation (1-3 sentences maximum).

User: ${userQuery}
Mira:`;
      }

      // Query LLM with full conversational context
      let replyText = "";
      try {
        const llmRes = await engineService.callLLM(promptWithContext, "chat");
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

      const unfreezeMicAndAwaken = () => {
        isSpeakingRef.current = false;
        isProcessingRef.current = false;
        // Unmute microphone: WebSocket and audio capture stay alive in background
        transcribeManager.setMutedDuringTTS(false);

        // Keep session awake for 8 seconds to allow follow-up responses without saying "Mira"
        isAwakeSessionRef.current = true;
        useChatStore.getState().setIsVoiceAwake(true);
        console.log(`[Mira Voice] Session ${finalSessionId} is AWAKE for 8s. Listening for follow-up without wake-word...`);

        if (awakeTimerRef.current) {
          clearTimeout(awakeTimerRef.current);
        }

        awakeTimerRef.current = setTimeout(() => {
          console.log(`[Mira Voice] Awake window expired (8s silence). Closing active voice session ${finalSessionId}. Next "Mira" trigger will create a new chat.`);
          isAwakeSessionRef.current = false;
          activeVoiceSessionIdRef.current = null;
          useChatStore.getState().setIsVoiceAwake(false);
        }, CONVERSATION_AWAKE_TIMEOUT_MS);
      };

      // Safety timer: maximum 25s TTS timeout
      const safetyTimer = setTimeout(unfreezeMicAndAwaken, 25000);

      // Single verified voice model (Sarah / EXAVITQu4vr4xnSDxMaL)
      ttsService.speak(replyText, {
        voiceId: DEFAULT_VOICE_ID,
        onFinish: () => {
          clearTimeout(safetyTimer);
          unfreezeMicAndAwaken();
        },
        onError: () => {
          clearTimeout(safetyTimer);
          unfreezeMicAndAwaken();
        },
      });
    };

    const handlePartial = (e: any) => {
      const text = e.detail?.text;
      if (text && !isSpeakingRef.current && !isProcessingRef.current && !transcribeManager.getIsMutedDuringTTS()) {
        window.dispatchEvent(
          new CustomEvent("mira-audio-signal", { detail: { level: 0.9, isSpeaking: true } })
        );

        // If user is currently awake and talking, suspend awake timeout so it doesn't expire while speaking
        if (isAwakeSessionRef.current && awakeTimerRef.current) {
          clearTimeout(awakeTimerRef.current);
          awakeTimerRef.current = null;
        }

        // If partial contains wake word OR session is currently awake, track partial
        const isRelevant = WAKE_WORD_REGEX.test(text) || isAwakeSessionRef.current;
        if (isRelevant) {
          latestPartialRef.current = text;

          // If user pauses for 2 seconds and VAD doesn't emit commit due to room noise, trigger anyway!
          if (partialFallbackTimerRef.current) {
            clearTimeout(partialFallbackTimerRef.current);
          }
          partialFallbackTimerRef.current = setTimeout(() => {
            const fallbackText = latestPartialRef.current.trim();
            latestPartialRef.current = "";
            if (fallbackText) {
              console.log("[useMiraWakeWord] Triggering via partial fallback timer:", fallbackText);
              processFinalSpeech(fallbackText);
            }
          }, 2000);
        }
      }
    };

    const handleVoiceHeard = (e: any) => {
      const record: TranscribeRecord = e.detail;
      if (!record || !record.text || record.source === "chat") return;

      // Discard if currently speaking or muted
      if (isSpeakingRef.current || isProcessingRef.current || transcribeManager.getIsMutedDuringTTS()) {
        return;
      }

      // If user is currently awake, clear timeout while speech is arriving
      if (isAwakeSessionRef.current && awakeTimerRef.current) {
        clearTimeout(awakeTimerRef.current);
        awakeTimerRef.current = null;
      }

      // Committed transcript arrived -> clear partial fallback timer
      if (partialFallbackTimerRef.current) {
        clearTimeout(partialFallbackTimerRef.current);
        partialFallbackTimerRef.current = null;
      }
      latestPartialRef.current = "";

      // Accumulate speech chunks with a 1.5s speech gap window to merge thoughts smoothly
      pendingBufferRef.current.push(record.text);

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      silenceTimerRef.current = setTimeout(() => {
        const fullSpeech = pendingBufferRef.current.join(" ").trim();
        pendingBufferRef.current = [];
        if (fullSpeech) {
          processFinalSpeech(fullSpeech);
        } else if (isAwakeSessionRef.current) {
          // Re-arm awake timer if buffer was empty
          awakeTimerRef.current = setTimeout(() => {
            console.log("[useMiraWakeWord] Awake window expired on silence.");
            isAwakeSessionRef.current = false;
            activeVoiceSessionIdRef.current = null;
            useChatStore.getState().setIsVoiceAwake(false);
          }, CONVERSATION_AWAKE_TIMEOUT_MS);
        }
      }, SPEECH_GAP_DELAY_MS);
    };

    window.addEventListener("mira-partial-transcription", handlePartial);
    window.addEventListener("mira-voice-heard", handleVoiceHeard);

    return () => {
      window.removeEventListener("mira-partial-transcription", handlePartial);
      window.removeEventListener("mira-voice-heard", handleVoiceHeard);
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (partialFallbackTimerRef.current) {
        clearTimeout(partialFallbackTimerRef.current);
      }
      if (awakeTimerRef.current) {
        clearTimeout(awakeTimerRef.current);
      }
    };
  }, []);
}
