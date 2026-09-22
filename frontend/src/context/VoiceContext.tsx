"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  VoiceState,
  VoiceErrorInfo,
  VoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  ParsedVoiceCommand,
  VoiceMetadata,
} from "../types/voice";
import { transitionVoice } from "../lib/voice/voiceStateMachine";
import { SpeechToTextEngine, AudioRecorder, isSpeechRecognitionSupported } from "../lib/voice/speechToText";
import {
  StreamingTextToSpeechPipeliner,
  soundEffects,
  isSpeechSynthesisSupported,
} from "../lib/voice/textToSpeech";
import { defaultTTSProvider } from "../lib/voice/ttsProvider";
import { localWakeWord } from "../lib/voice/wakeWordDetector";
import {
  routeVoiceCommand,
  isInterruptionIntent,
  isStopOnlyIntent,
  isAcousticEcho,
} from "../lib/voice/voiceCommandRouter";
import { useCognitiveActivity } from "./CognitiveContext";
import { safeStorage, STORAGE_KEYS } from "../lib/storage";
import { useOptionalTrust } from "./TrustContext";
import { bufferToBase64 } from "../lib/voice/audioEncoding";
import { verifyOwnerIdentity as apiVerifyOwnerIdentity } from "../lib/api";

interface VoiceContextType {
  voiceState: VoiceState;
  transcript: string;
  interimTranscript: string;
  detectedLanguage: "en" | "hi" | "hinglish" | null;
  isAnalyzingLanguage: boolean;
  isVoiceModalOpen: boolean;
  isWakeWordEnabled: boolean;
  isWakeWordListening: boolean;
  hasMicPermission: boolean | null;
  error: VoiceErrorInfo | null;
  settings: VoiceSettings;
  availableVoices: VoiceMetadata[];
  selectedVoiceMetadata: VoiceMetadata | null;
  isPreviewPlaying: boolean;
  previewVoice: (voiceId?: string, customText?: string) => Promise<void>;
  stopPreview: () => void;
  updateSettings: (newSettings: Partial<VoiceSettings>) => void;
  openVoiceModal: () => void;
  closeVoiceModal: () => void;
  toggleVoiceModal: () => void;
  toggleWakeWord: () => void;
  startListening: (options?: { isBargeIn?: boolean }) => Promise<void>;
  stopListening: () => void;
  cancelListening: () => void;
  interrupt: (options?: { isStopOnly?: boolean }) => void;
  processSpokenUtterance: (utterance: string, attachmentFile?: File) => Promise<void>;
  registerChatHandlers: (handlers: {
    sendChatMessage: (content: string, attachmentFile?: File) => Promise<void>;
    abortChatStream: () => void;
    createNewConversation: () => Promise<void>;
    navigateTab: (tab: string) => void;
    getLastAssistantMessage: () => string | null;
  }) => void;
  unregisterChatHandlers: () => void;
  feedStreamDeltaToVoice: (delta: string) => void;
  setTurnLanguageVoice: (targetLang: "hi" | "en-IN" | "en") => void;
  finishStreamVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const trust = useOptionalTrust();
  const recordActivity = trust?.recordActivity;

  const {
    startListening: cognitiveStartListening,
    startSpeaking: cognitiveStartSpeaking,
    startThinking: cognitiveStartThinking,
    triggerInterrupted: cognitiveTriggerInterrupted,
    setIdle: cognitiveSetIdle,
    triggerError: cognitiveTriggerError,
  } = useCognitiveActivity();

  // Load saved settings or defaults
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    return safeStorage.get<VoiceSettings>(STORAGE_KEYS.VOICE_SETTINGS, DEFAULT_VOICE_SETTINGS);
  });

  const [voiceState, setVoiceStateRaw] = useState<VoiceState>("IDLE");
  const [transcript, setTranscript] = useState<string>("");
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [detectedLanguage, setDetectedLanguage] = useState<"en" | "hi" | "hinglish" | null>(null);
  const [isAnalyzingLanguage, setIsAnalyzingLanguage] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState<boolean>(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<VoiceErrorInfo | null>(null);
  const [availableVoices, setAvailableVoices] = useState<VoiceMetadata[]>([]);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);

  // References
  const sttEngineRef = useRef<SpeechToTextEngine | null>(null);
  const ttsPipelinerRef = useRef<StreamingTextToSpeechPipeliner | null>(null);
  const chatHandlersRef = useRef<{
    sendChatMessage: (content: string, attachmentFile?: File) => Promise<void>;
    abortChatStream: () => void;
    createNewConversation: () => Promise<void>;
    navigateTab: (tab: string) => void;
    getLastAssistantMessage: () => string | null;
  } | null>(null);
  const voiceBiometricRecorderRef = useRef<AudioRecorder | null>(null);
  const currentTurnIdRef = useRef<number>(0);
  const lastProcessedUtteranceRef = useRef<{ text: string; timestamp: number } | null>(null);

  // Continuous Speaker Verification state & audio analysis refs
  const continuousVerifyIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVerificationInFlightRef = useRef<boolean>(false);
  const lastVerifiedSpeakerResultRef = useRef<"OWNER" | "GUEST" | null>(null);
  const continuousSpeechMsRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const lastAuthoritativeAuthTimeRef = useRef<number>(0);
  const consecutiveNonOwnerCountRef = useRef<number>(0);
  const lastTtsFinishedTimeRef = useRef<number>(0);

  const voiceStateRef = useRef<VoiceState>(voiceState);
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const startListeningRef = useRef<(options?: { isBargeIn?: boolean }) => Promise<void>>(() => Promise.resolve());
  const processSpokenUtteranceRef = useRef<(utterance: string, attachmentFile?: File) => Promise<void>>(() => Promise.resolve());
  const openVoiceModalRef = useRef<() => void>(() => {});

  // Load genuine voices on mount
  useEffect(() => {
    defaultTTSProvider.getVoices().then((voices) => {
      setAvailableVoices(voices);
    });
  }, []);

  // Compute active VoiceMetadata
  const selectedVoiceMetadata = useMemo(() => {
    if (!settings.voiceUri) return availableVoices[0] || null;
    return availableVoices.find((v) => v.id === settings.voiceUri) || availableVoices[0] || null;
  }, [availableVoices, settings.voiceUri]);

  const setVoiceState = useCallback((next: VoiceState) => {
    const validated = transitionVoice(voiceStateRef.current, next);
    setVoiceStateRaw(validated);
    voiceStateRef.current = validated;
  }, []);

  // Update Settings with instant persistence and sub-engine synchronization
  const updateSettings = useCallback((newSettings: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...newSettings };
      safeStorage.set(STORAGE_KEYS.VOICE_SETTINGS, merged);
      ttsPipelinerRef.current?.updateSettings(merged);
      if (newSettings.language) {
        sttEngineRef.current?.setLanguage(newSettings.language);
      }
      return merged;
    });
  }, []);

  // Voice Preview Engine
  const previewVoice = useCallback(
    async (voiceId?: string, customText?: string) => {
      const targetVoiceId = voiceId !== undefined ? voiceId : settings.voiceUri;
      await defaultTTSProvider.previewVoice(
        targetVoiceId,
        settings.language,
        customText,
        (state) => {
          setIsPreviewPlaying(state === "playing");
        },
      );
    },
    [settings.voiceUri, settings.language],
  );

  const stopPreview = useCallback(() => {
    defaultTTSProvider.stop();
    setIsPreviewPlaying(false);
  }, []);

  // Register / Unregister workspace handlers
  const registerChatHandlers = useCallback((handlers: typeof chatHandlersRef.current) => {
    chatHandlersRef.current = handlers;
  }, []);

  const unregisterChatHandlers = useCallback(() => {
    chatHandlersRef.current = null;
  }, []);

  // Initialize Speech-to-Text Engine safely in effect
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sttEngineRef.current) {
      sttEngineRef.current = new SpeechToTextEngine({
        continuous: true,
        interimResults: true,
        silenceTimeoutMs: settings.autoSendDelayMs > 0 ? settings.autoSendDelayMs : 900,
      });
    }
    sttEngineRef.current.setLanguage(settings.language);
  }, [settings.autoSendDelayMs, settings.language]);

  // Initialize Text-to-Speech Pipeliner
  const initTTSPipeliner = useCallback(() => {
    if (typeof window === "undefined") return;

    ttsPipelinerRef.current = new StreamingTextToSpeechPipeliner(settings, {
      onStart: () => {
        setVoiceState("SPEAKING");
        cognitiveStartSpeaking();
        if (!sttEngineRef.current?.isRunning()) {
          startListeningRef.current({ isBargeIn: true });
        }
      },
      onSentenceStart: () => {
        setVoiceState("SPEAKING");
        cognitiveStartSpeaking();
        if (!sttEngineRef.current?.isRunning()) {
          startListeningRef.current({ isBargeIn: true });
        }
      },
      onAllFinished: () => {
        // Flush active turn ID and STT buffer so residual speaker audio does not trigger self-listening
        currentTurnIdRef.current++;
        lastTtsFinishedTimeRef.current = Date.now();
        sttEngineRef.current?.resetBuffer();
        sttEngineRef.current?.abort();
        setInterimTranscript("");
        continuousSpeechMsRef.current = 0;
        lastVerifiedSpeakerResultRef.current = null;
        if (voiceBiometricRecorderRef.current) {
          voiceBiometricRecorderRef.current.cleanup();
          voiceBiometricRecorderRef.current = null;
        }

        setVoiceState("IDLE");
        cognitiveSetIdle();

        // If continuous conversation mode is enabled and voice modal is active, resume listening!
        if (settings.continuousConversation && isVoiceModalOpen) {
          setTimeout(() => {
            if (voiceStateRef.current === "IDLE") {
              startListeningRef.current();
            }
          }, 450);
        } else {
          localWakeWord.resumeAfterVoiceSession();
        }
      },
      onInterrupted: () => {
        lastTtsFinishedTimeRef.current = Date.now();
        setVoiceState("INTERRUPTED");
        cognitiveTriggerInterrupted();
      },
      onError: (err) => {
        setError(err);
        setVoiceState("ERROR");
        cognitiveTriggerError();
      },
    });
  }, [
    settings,
    isVoiceModalOpen,
    setVoiceState,
    cognitiveStartSpeaking,
    cognitiveSetIdle,
    cognitiveTriggerInterrupted,
    cognitiveTriggerError,
  ]);

  useEffect(() => {
    initTTSPipeliner();
  }, [initTTSPipeliner]);

  // Feed incoming text tokens from Gemini SSE into TTS pipeliner
  const feedStreamDeltaToVoice = useCallback((delta: string) => {
    recordActivity?.();
    if (isVoiceModalOpen || voiceStateRef.current === "THINKING" || voiceStateRef.current === "SPEAKING") {
      ttsPipelinerRef.current?.feedDelta(delta);
    }
  }, [isVoiceModalOpen, recordActivity]);

  const setTurnLanguageVoice = useCallback((targetLang: "hi" | "en-IN" | "en") => {
    ttsPipelinerRef.current?.setTurnLanguage(targetLang);
    const lang = targetLang === "hi" ? "hi" : targetLang === "en-IN" ? "hinglish" : "en";
    setDetectedLanguage(lang);
    setIsAnalyzingLanguage(false);
  }, []);

  const finishStreamVoice = useCallback(() => {
    if (isVoiceModalOpen || voiceStateRef.current === "THINKING" || voiceStateRef.current === "SPEAKING") {
      ttsPipelinerRef.current?.finishStream();
    }
  }, [isVoiceModalOpen]);

  // Cleanup active continuous speaker verification loop and audio context
  const cleanupContinuousVerifier = useCallback(() => {
    if (continuousVerifyIntervalRef.current) {
      clearInterval(continuousVerifyIntervalRef.current);
      continuousVerifyIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserNodeRef.current = null;
    isVerificationInFlightRef.current = false;
    continuousSpeechMsRef.current = 0;
  }, []);

  // Barge-in / Interrupt Action
  const interrupt = useCallback(
    (options?: { isStopOnly?: boolean }) => {
      const isStopOnly = options?.isStopOnly ?? false;

      // Invalidate active turn so any pending STT callbacks are discarded
      currentTurnIdRef.current++;

      // 1. Cancel speech synthesis immediately
      ttsPipelinerRef.current?.cancel();

      // 2. Abort any active SSE chat stream
      chatHandlersRef.current?.abortChatStream();

      // 3. Abort STT instance so the interruption keyword ("stop") is not treated as a new prompt
      sttEngineRef.current?.abort();

      // 4. Clean up continuous verifier
      cleanupContinuousVerifier();

      // 5. Clean up parallel biometric recorder and verify interruption speaker
      if (voiceBiometricRecorderRef.current) {
        const rec = voiceBiometricRecorderRef.current;
        voiceBiometricRecorderRef.current = null;

        // If someone interrupted TwinMind, evaluate if it was a non-owner speaker
        (async () => {
          try {
            const wavBlob = await rec.stopWav();
            if (wavBlob && wavBlob.size > 1000 && trust?.voiceEnrolled && !trust?.isVoiceEnrolling) {
              const arrayBuf = await wavBlob.arrayBuffer();
              const audioBase64 = bufferToBase64(arrayBuf);
              const verifyResult = await apiVerifyOwnerIdentity({ method: "VOICE", audioBase64 });
              if (verifyResult.voiceState === "VOICE_NON_OWNER") {
                console.warn("[TwinVoice] Reliable non-owner interruption detected! Demoting session to Guest Mode.");
                trust?.setSpeakerState("UNKNOWN_SPEAKER");
                await trust?.setMode("GUEST");
              } else if (verifyResult.voiceState === "VOICE_OWNER_MATCH") {
                trust?.setSpeakerState("OWNER_CONFIRMED");
              }
            }
          } catch {
            // Ignore
          } finally {
            rec.cleanup();
          }
        })();
      }

      setInterimTranscript("");

      if (isStopOnly) {
        // Immediate silence: no audio chirp, no extra speech, transition directly to IDLE
        cognitiveSetIdle();
        setVoiceState("IDLE");
        localWakeWord.resumeAfterVoiceSession();
        return;
      }

      // 6. Conversational barge-in: Play soft descent audio cue if sound effects are enabled
      if (settings.soundEffectsEnabled) {
        soundEffects.playInterruptChirp();
      }

      // 7. Quick visual contraction
      cognitiveTriggerInterrupted();
      setVoiceState("INTERRUPTED");

      // 8. Instantly resume listening for new user speech
      setTimeout(() => {
        startListeningRef.current();
      }, 150);
    },
    [
      settings.soundEffectsEnabled,
      cognitiveTriggerInterrupted,
      cognitiveSetIdle,
      setVoiceState,
      cleanupContinuousVerifier,
      trust,
    ],
  );

  // Immediate Guest Mode Trigger: Revoke owner status, stop generation, announce warning
  const handleImmediateGuestDemotion = useCallback(async () => {
    if (trust?.mode === "GUEST") {
      // Already in Guest Mode; ensure speaker state is set but don't re-announce
      trust?.setSpeakerState("UNKNOWN_SPEAKER");
      return;
    }
    console.warn("[TwinVoice] Non-owner voice detected! Triggering Immediate Guest Mode.");
    cleanupContinuousVerifier();
    interrupt({ isStopOnly: true });
    chatHandlersRef.current?.abortChatStream();
    trust?.setSpeakerState("UNKNOWN_SPEAKER");
    await trust?.setMode("GUEST");

    const warningMsg =
      "I noticed a different voice. Switching to Guest Mode to protect the owner's private memory.";
    setTranscript(warningMsg);
    setVoiceState("SPEAKING");
    cognitiveStartSpeaking();

    if (isSpeechSynthesisSupported()) {
      const utt = new SpeechSynthesisUtterance(warningMsg);
      utt.onend = () => {
        setVoiceState("IDLE");
        cognitiveSetIdle();
        localWakeWord.resumeAfterVoiceSession();
      };
      window.speechSynthesis.speak(utt);
    } else {
      setVoiceState("IDLE");
      cognitiveSetIdle();
      localWakeWord.resumeAfterVoiceSession();
    }
  }, [trust, interrupt, setVoiceState, cognitiveStartSpeaking, cognitiveSetIdle, cleanupContinuousVerifier]);

  // Process a finalized spoken utterance
  const processSpokenUtterance = useCallback(
    async (utterance: string, attachmentFile?: File) => {
      recordActivity?.();

      // Invalidate active listening session so any delayed callbacks are discarded
      currentTurnIdRef.current++;
      sttEngineRef.current?.resetBuffer();

      if (trust?.isVoiceEnrolling) {
        console.log("[TwinVoice] Suppressed utterance during active voice biometric enrollment session:", utterance);
        setVoiceState("IDLE");
        cognitiveSetIdle();
        return;
      }

      const trimmed = utterance.trim();
      if (!trimmed && !attachmentFile) {
        setVoiceState("IDLE");
        cognitiveSetIdle();
        localWakeWord.resumeAfterVoiceSession();
        return;
      }

      // TTS self-listening immunity: Discard any utterance triggered while assistant is speaking or within cooldown window
      const isSpeaking = voiceStateRef.current === "SPEAKING" || ttsPipelinerRef.current?.isActive();
      const isPostTtsCooldown = Date.now() - lastTtsFinishedTimeRef.current < 500;
      const isInterruption = isInterruptionIntent(trimmed);

      if ((isSpeaking || isPostTtsCooldown) && !isInterruption) {
        console.log("[TwinVoice] Discarded utterance during active TTS playback or cooldown window:", utterance);
        return;
      }

      // Universal Acoustic Echo Guard: Reject if utterance matches recent assistant speech
      const recentSpoken = ttsPipelinerRef.current?.getAllCurrentAndRecentText() || "";
      if (recentSpoken && isAcousticEcho(trimmed, recentSpoken)) {
        console.log("[TwinVoice] Dropped acoustic echo in processSpokenUtterance:", trimmed);
        setVoiceState("IDLE");
        cognitiveSetIdle();
        localWakeWord.resumeAfterVoiceSession();
        return;
      }

      // Deduplication guard: reject if the exact same utterance or overlapping prefix was processed within last 3.5s
      const now = Date.now();
      const normTrimmed = trimmed.toLowerCase().replace(/[^\w\s]/g, "").trim();
      if (
        lastProcessedUtteranceRef.current &&
        now - lastProcessedUtteranceRef.current.timestamp < 3500
      ) {
        const prevNorm = lastProcessedUtteranceRef.current.text
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .trim();
        if (
          normTrimmed === prevNorm ||
          normTrimmed.startsWith(prevNorm) ||
          prevNorm.startsWith(normTrimmed)
        ) {
          console.warn("[TwinVoice] Dropped duplicate/stale utterance within 3.5s window:", trimmed);
          if (voiceStateRef.current === "LISTENING" || voiceStateRef.current === "TRANSCRIBING") {
            setVoiceState("IDLE");
            cognitiveSetIdle();
          }
          return;
        }
      }
      lastProcessedUtteranceRef.current = { text: trimmed, timestamp: now };

      setTranscript(trimmed);
      setInterimTranscript("");
      setVoiceState("THINKING");
      cognitiveStartThinking();

      // Extract recorded acoustic buffer (WAV) for speaker identity verification
      cleanupContinuousVerifier();
      let audioBlob: Blob | null = null;
      if (voiceBiometricRecorderRef.current) {
        try {
          audioBlob = await voiceBiometricRecorderRef.current.stopWav();
        } catch {
          audioBlob = null;
        }
        voiceBiometricRecorderRef.current = null;
      }

      // Continuous & Utterance Speaker Biometric Verification
      // Protect owner private memory: never execute owner prompts for non-owner speakers
      let isOwner = trust?.mode === "OWNER";

      if (trust?.voiceEnrolled && !trust?.isVoiceEnrolling) {
        isOwner = false;

        // Prioritize verifying the complete utterance audio buffer directly
        if (audioBlob && audioBlob.size > 1000) {
          const callEpoch = trust?.authEpoch ?? 1;
          try {
            trust?.setSpeakerState("VERIFYING");
            const arrayBuf = await audioBlob.arrayBuffer();
            const audioBase64 = bufferToBase64(arrayBuf);
            const verifyResult = await apiVerifyOwnerIdentity({
              method: "VOICE",
              audioBase64,
            });

            // Discard stale verification result if higher epoch authoritative auth completed
            if (trust?.authEpoch !== undefined && trust.authEpoch > callEpoch) {
              console.log("[TwinVoice] Discarding stale utterance verification from epoch", callEpoch, "current:", trust.authEpoch);
              return;
            }

            if (verifyResult.voiceState === "VOICE_OWNER_MATCH") {
              isOwner = true;
              consecutiveNonOwnerCountRef.current = 0;
              trust?.setSpeakerState("OWNER_CONFIRMED");
              trust?.reportVoiceEvidence?.("OWNER_VOICE");
              // CRITICAL: Voice match alone in Guest Mode is an identity signal, NOT authorization.
              // Never call syncMode("OWNER") on voice match alone!
            } else if (verifyResult.voiceState === "VOICE_NON_OWNER") {
              console.warn("[TwinVoice] Definitive non-owner voice detected on utterance:", verifyResult);
              isOwner = false;
              trust?.reportVoiceEvidence?.("NON_OWNER_VOICE");
            } else {
              // VOICE_VERIFICATION_FAILED: noise or inconclusive (UNKNOWN)
              console.log("[TwinVoice] Inconclusive utterance speaker verification:", verifyResult);
              trust?.reportVoiceEvidence?.("UNKNOWN_VOICE");
              // Fail-closed security rule:
              // If already authenticated as OWNER, an ambiguous utterance does NOT demote to GUEST.
              // If currently in GUEST mode, it remains in GUEST mode.
              if (trust?.mode === "OWNER") {
                isOwner = true;
              } else {
                isOwner = false;
              }
            }
          } catch (verErr) {
            console.warn("[TwinVoice] Utterance biometric verification error:", verErr);
            isOwner = trust?.mode === "OWNER";
          }
        } else if (lastVerifiedSpeakerResultRef.current === "OWNER") {
          // Fallback to continuous verification result if audioBlob was minimal
          isOwner = true;
          consecutiveNonOwnerCountRef.current = 0;
          trust?.setSpeakerState("OWNER_CONFIRMED");
        } else {
          console.warn("[TwinVoice] Missing or insufficient biometric audio for owner verification.");
          isOwner = trust?.mode === "OWNER";
        }

        // Always reset per-turn verified speaker cache
        lastVerifiedSpeakerResultRef.current = null;

        // If the detected speaker is NOT the enrolled Owner:
        // When in Owner Mode, switch to Guest to protect owner private memory.
        // When already in Guest Mode, allow the query to execute normally in the Guest sandbox!
        if (!isOwner) {
          lastVerifiedSpeakerResultRef.current = "GUEST";
          if (trust?.mode === "OWNER") {
            await handleImmediateGuestDemotion();
            return;
          }
          trust?.setSpeakerState("UNKNOWN_SPEAKER");
        }
      }

      // Route through Voice Command Router
      const command: ParsedVoiceCommand = routeVoiceCommand(trimmed);

      // Handle Command Intents
      if (command.intent === "STOP_GENERATION") {
        interrupt({ isStopOnly: true });
        return;
      }

      if (command.intent === "VERIFY_OWNER") {
        if (trust?.mode === "OWNER") {
          setVoiceState("SPEAKING");
          cognitiveStartSpeaking();
          if (isSpeechSynthesisSupported()) {
            const utt = new SpeechSynthesisUtterance("You are already verified in Owner Mode with full privileges.");
            utt.onend = () => {
              setVoiceState("IDLE");
              cognitiveSetIdle();
              localWakeWord.resumeAfterVoiceSession();
            };
            window.speechSynthesis.speak(utt);
          } else {
            setVoiceState("IDLE");
            cognitiveSetIdle();
          }
          return;
        }

        // Currently in GUEST Mode:
        // Case 1: No enrolled voice profile
        if (!trust?.voiceEnrolled) {
          setVoiceState("SPEAKING");
          cognitiveStartSpeaking();
          if (isSpeechSynthesisSupported()) {
            const utt = new SpeechSynthesisUtterance("No owner voice profile is enrolled. Please complete passkey authentication to enter Owner Mode.");
            window.speechSynthesis.speak(utt);
          }
          try {
            const passkeySuccess = await trust?.verifyIdentity("OS_AUTH");
            setVoiceState("SPEAKING");
            cognitiveStartSpeaking();
            const speakMsg = passkeySuccess
              ? "You are verified. Owner Mode is now active."
              : "Owner verification was canceled or could not be verified. Remaining in Guest Mode.";
            if (isSpeechSynthesisSupported()) {
              const utt = new SpeechSynthesisUtterance(speakMsg);
              utt.onend = () => {
                setVoiceState("IDLE");
                cognitiveSetIdle();
                localWakeWord.resumeAfterVoiceSession();
              };
              window.speechSynthesis.speak(utt);
            } else {
              setVoiceState("IDLE");
              cognitiveSetIdle();
            }
          } catch {
            setVoiceState("IDLE");
            cognitiveSetIdle();
          }
          return;
        }

        // Case 2: Voice enrolled, but the speaker voice did NOT match owner
        if (!isOwner) {
          setVoiceState("SPEAKING");
          cognitiveStartSpeaking();
          const speakMsg = "Voice did not match the enrolled owner profile. Remaining in Guest Mode.";
          if (isSpeechSynthesisSupported()) {
            const utt = new SpeechSynthesisUtterance(speakMsg);
            utt.onend = () => {
              setVoiceState("IDLE");
              cognitiveSetIdle();
              localWakeWord.resumeAfterVoiceSession();
            };
            window.speechSynthesis.speak(utt);
          } else {
            setVoiceState("IDLE");
            cognitiveSetIdle();
          }
          return;
        }

        // Case 3: Owner voice MATCHED!
        // Security Rule: VOICE = identity signal, PASSKEY = authorization.
        // Prompt user verbally and visually, keeping state strictly as GUEST + Verification Pending.
        setVoiceState("THINKING");
        cognitiveStartThinking();
        if (isSpeechSynthesisSupported()) {
          const promptUtt = new SpeechSynthesisUtterance("I've verified your voice. Please complete your passkey authentication to enter Owner Mode.");
          window.speechSynthesis.speak(promptUtt);
        }

        try {
          // Trigger the authoritative Passkey/WebAuthn flow
          const passkeySuccess = await trust?.verifyIdentity("OS_AUTH");
          if (passkeySuccess) {
            consecutiveNonOwnerCountRef.current = 0;
            lastAuthoritativeAuthTimeRef.current = Date.now();
            lastVerifiedSpeakerResultRef.current = "OWNER";
          }
          setVoiceState("SPEAKING");
          cognitiveStartSpeaking();
          const speakMsg = passkeySuccess
            ? "You are verified. Owner Mode is now active."
            : "Owner verification was canceled or could not be verified. Remaining in Guest Mode.";
          if (isSpeechSynthesisSupported()) {
            const utt = new SpeechSynthesisUtterance(speakMsg);
            utt.onend = () => {
              setVoiceState("IDLE");
              cognitiveSetIdle();
              localWakeWord.resumeAfterVoiceSession();
            };
            window.speechSynthesis.speak(utt);
          } else {
            setVoiceState("IDLE");
            cognitiveSetIdle();
          }
        } catch {
          setVoiceState("IDLE");
          cognitiveSetIdle();
        }
        return;
      }

      if (command.intent === "NEW_CONVERSATION") {
        await chatHandlersRef.current?.createNewConversation();
        setVoiceState("SPEAKING");
        cognitiveStartSpeaking();
        if (isSpeechSynthesisSupported()) {
          const utt = new SpeechSynthesisUtterance("Starting a new thought.");
          utt.onend = () => {
            setVoiceState("IDLE");
            cognitiveSetIdle();
            localWakeWord.resumeAfterVoiceSession();
          };
          window.speechSynthesis.speak(utt);
        } else {
          setVoiceState("IDLE");
          cognitiveSetIdle();
        }
        return;
      }

      if (command.intent === "NAVIGATE" && command.target) {
        chatHandlersRef.current?.navigateTab(command.target);
        setVoiceState("SPEAKING");
        cognitiveStartSpeaking();
        if (isSpeechSynthesisSupported()) {
          const utt = new SpeechSynthesisUtterance(`Opening ${command.target}.`);
          utt.onend = () => {
            setVoiceState("IDLE");
            cognitiveSetIdle();
            localWakeWord.resumeAfterVoiceSession();
          };
          window.speechSynthesis.speak(utt);
        } else {
          setVoiceState("IDLE");
          cognitiveSetIdle();
        }
        return;
      }

      if (command.intent === "REPEAT") {
        const lastMsg = chatHandlersRef.current?.getLastAssistantMessage();
        if (lastMsg) {
          setVoiceState("SPEAKING");
          cognitiveStartSpeaking();
          initTTSPipeliner();
          ttsPipelinerRef.current?.feedDelta(lastMsg);
          ttsPipelinerRef.current?.finishStream();
        } else {
          setVoiceState("IDLE");
          cognitiveSetIdle();
        }
        return;
      }

      // Default: CHAT_QUERY or SUMMARIZE -> Dispatch to Twin Core Gemini
      initTTSPipeliner();
      try {
        if (chatHandlersRef.current?.sendChatMessage) {
          await chatHandlersRef.current.sendChatMessage(command.cleanedQuery, attachmentFile);
        } else {
          throw new Error("Chat engine is not initialized in active workspace.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to generate AI response";
        setError({ type: "GEMINI_FAILURE", message: msg, originalError: err });
        setVoiceState("ERROR");
        cognitiveTriggerError();
      }
    },
    [
      initTTSPipeliner,
      interrupt,
      setVoiceState,
      cognitiveStartThinking,
      cognitiveStartSpeaking,
      cognitiveSetIdle,
      cognitiveTriggerError,
      recordActivity,
      cleanupContinuousVerifier,
      handleImmediateGuestDemotion,
      trust,
    ],
  );

  // Start Listening (supports normal listening and background barge-in listening)
  const startListening = useCallback(
    async (options?: { isBargeIn?: boolean }): Promise<void> => {
      recordActivity?.();
      if (trust?.isVoiceEnrolling) {
        console.log("[TwinVoice] Cannot start voice assistant listening while voice enrollment is active.");
        return;
      }
      const isBargeIn = options?.isBargeIn ?? false;
      const sessionTurnId = ++currentTurnIdRef.current;

      // If user clicked listening button while speaking/thinking, interrupt immediately
      if (!isBargeIn && (voiceStateRef.current === "SPEAKING" || voiceStateRef.current === "THINKING")) {
        interrupt();
        return;
      }

      setError(null);
      setInterimTranscript("");
      if (settings.language === "auto") {
        setIsAnalyzingLanguage(true);
      } else {
        setIsAnalyzingLanguage(false);
        setDetectedLanguage(settings.language as "en" | "hi" | "hinglish");
      }
      localWakeWord.pauseForVoiceSession();

      // Give browser audio pipeline a brief buffer to release background wake-word listener
      await new Promise((resolve) => setTimeout(resolve, 60));

      if (sessionTurnId !== currentTurnIdRef.current) return;
      if (!sttEngineRef.current) return;

      if (!isBargeIn) {
        setVoiceState("LISTENING");
        cognitiveStartListening();
      }

      // If voice biometric is enrolled, capture audio in parallel for continuous speaker verification
      // in BOTH OWNER and GUEST modes (Owner mismatch demotion & Returning Owner restoration)
      if (trust?.voiceEnrolled && !trust?.isVoiceEnrolling) {
        cleanupContinuousVerifier();
        lastVerifiedSpeakerResultRef.current = null;
        continuousSpeechMsRef.current = 0;
        trust?.setSpeakerState("NO_SPEECH");

        if (!voiceBiometricRecorderRef.current) {
          try {
            const rec = new AudioRecorder();
            await rec.start();
            voiceBiometricRecorderRef.current = rec;
          } catch (e) {
            console.warn("[TwinVoice] Failed to start biometric AudioRecorder:", e);
            voiceBiometricRecorderRef.current = null;
          }
        }

        const activeRec = voiceBiometricRecorderRef.current;
        const stream = activeRec?.getMediaStream();
        if (stream && stream.active && typeof window !== "undefined") {
          try {
            const AudioCtxClass =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const audioCtx = new AudioCtxClass();
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            analyserNodeRef.current = analyser;

            const pcmData = new Float32Array(analyser.fftSize);

            continuousVerifyIntervalRef.current = setInterval(async () => {
              // TTS self-listening immunity: pause speech accumulation during active TTS playback
              if (
                voiceStateRef.current === "SPEAKING" ||
                ttsPipelinerRef.current?.isActive()
              ) {
                return;
              }

              if (!analyserNodeRef.current) return;
              analyserNodeRef.current.getFloatTimeDomainData(pcmData);

              let sumSq = 0;
              for (let i = 0; i < pcmData.length; i++) {
                sumSq += pcmData[i] * pcmData[i];
              }
              const rms = Math.sqrt(sumSq / pcmData.length);

              // Speech frame detection (RMS > 0.012)
              if (rms > 0.012) {
                continuousSpeechMsRef.current += 100;
                trust?.setSpeakerState((prev) => (prev === "NO_SPEECH" ? "SPEECH_DETECTED" : prev));
              }

              // After accumulating >= 1.5 seconds of user speech, run background biometric verification
              // strictly when voice is enrolled and session is in OWNER mode
              if (
                continuousSpeechMsRef.current >= 1500 &&
                !isVerificationInFlightRef.current &&
                voiceBiometricRecorderRef.current &&
                trust?.voiceEnrolled &&
                !trust?.isVoiceEnrolling &&
                trust?.mode === "OWNER"
              ) {
                isVerificationInFlightRef.current = true;
                trust?.setSpeakerState("VERIFYING");
                const callEpoch = trust?.authEpoch ?? 1;

                try {
                  const sliceBlob = await voiceBiometricRecorderRef.current.getCurrentWavBlob();
                  if (sliceBlob && sliceBlob.size > 2000) {
                    const arrayBuf = await sliceBlob.arrayBuffer();
                    const audioBase64 = bufferToBase64(arrayBuf);
                    const verifyResult = await apiVerifyOwnerIdentity({
                      method: "VOICE",
                      audioBase64,
                    });

                    // Check if an authoritative elevation or epoch change occurred in-flight
                    if (trust?.authEpoch !== undefined && trust.authEpoch > callEpoch) {
                      console.log(
                        "[TwinVoice Continuous] Discarding stale verification result from epoch",
                        callEpoch,
                        "current epoch:",
                        trust.authEpoch
                      );
                      return;
                    }

                    if (verifyResult.voiceState === "VOICE_NON_OWNER") {
                      consecutiveNonOwnerCountRef.current += 1;
                      trust?.reportVoiceEvidence?.("NON_OWNER_VOICE");
                      // Temporal debouncing: Only demote an active OWNER if we observe 2 consecutive non-owner frames (~3s speech),
                      // or if we are already in GUEST mode.
                      if (trust?.mode !== "OWNER" || consecutiveNonOwnerCountRef.current >= 2) {
                        lastVerifiedSpeakerResultRef.current = "GUEST";
                        trust?.setSpeakerState("UNKNOWN_SPEAKER");
                        await handleImmediateGuestDemotion();
                        return;
                      } else {
                        console.log(
                          `[TwinVoice Continuous] Potential non-owner detected (${consecutiveNonOwnerCountRef.current}/2) - waiting for confirmation window`
                        );
                        trust?.setSpeakerState("VERIFYING");
                      }
                    } else if (verifyResult.voiceState === "VOICE_OWNER_MATCH") {
                      consecutiveNonOwnerCountRef.current = 0;
                      lastVerifiedSpeakerResultRef.current = "OWNER";
                      trust?.setSpeakerState("OWNER_CONFIRMED");
                      trust?.reportVoiceEvidence?.("OWNER_VOICE");
                    } else {
                      // VOICE_VERIFICATION_FAILED: noise or inconclusive. Anti-false-positive: DO NOT DEMOTE!
                      consecutiveNonOwnerCountRef.current = 0;
                      trust?.reportVoiceEvidence?.("UNKNOWN_VOICE");
                      trust?.setSpeakerState((prev) => (prev === "VERIFYING" ? "SPEECH_DETECTED" : prev));
                    }
                  }
                } catch (verifyErr) {
                  console.warn("[TwinVoice Continuous] Verification cycle error:", verifyErr);
                  trust?.setSpeakerState((prev) => (prev === "VERIFYING" ? "SPEECH_DETECTED" : prev));
                } finally {
                  continuousSpeechMsRef.current = 0;
                  isVerificationInFlightRef.current = false;
                }
              }
            }, 100);
          } catch (audioCtxErr) {
            console.warn("[TwinVoice Continuous] Failed to initialize AudioContext analyzer:", audioCtxErr);
          }
        }
      }

      await sttEngineRef.current.start({
        onStart: () => {
          if (sessionTurnId !== currentTurnIdRef.current) return;
          setHasMicPermission(true);
          if (!isBargeIn && voiceStateRef.current !== "SPEAKING" && voiceStateRef.current !== "THINKING") {
            setVoiceState("LISTENING");
            cognitiveStartListening();
          }
        },
        onInterimTranscript: (text) => {
          if (sessionTurnId !== currentTurnIdRef.current) return;

          // Universal Acoustic Echo Guard against all recent and current TTS output
          const recentSpoken = ttsPipelinerRef.current?.getAllCurrentAndRecentText() || "";
          if (recentSpoken && isAcousticEcho(text, recentSpoken)) {
            return;
          }

          const isSpeakingOrThinking =
            voiceStateRef.current === "SPEAKING" ||
            voiceStateRef.current === "THINKING" ||
            ttsPipelinerRef.current?.isActive();

          if (isSpeakingOrThinking) {
            // While TwinMind is speaking its answer, ONLY explicit interruption intents are allowed to interrupt!
            // All other acoustic input is assistant speaker output or ambient sound.
            if (isInterruptionIntent(text)) {
              if (isStopOnlyIntent(text)) {
                // Immediate silence! Stop-only interruption
                interrupt({ isStopOnly: true });
                return;
              } else {
                // Conversational interruption with follow-up instruction
                interrupt({ isStopOnly: false });
                setInterimTranscript(text);
                return;
              }
            }
            // Discard any non-interruption text received while speaking (TTS self-listening immunity)
            return;
          } else {
            // In normal listening: stop-only commands immediately return to IDLE
            if (isInterruptionIntent(text) && isStopOnlyIntent(text)) {
              interrupt({ isStopOnly: true });
              return;
            }
            setInterimTranscript(text);
            if (settings.language === "auto" && text.trim().length > 0) {
              if (/[\u0900-\u097F]/.test(text)) {
                setDetectedLanguage("hi");
                setIsAnalyzingLanguage(false);
              }
            }
          }
        },
        onFinalTranscript: (finalText) => {
          if (sessionTurnId !== currentTurnIdRef.current) return;

          // Universal Acoustic Echo Guard against all recent and current TTS output
          const recentSpoken = ttsPipelinerRef.current?.getAllCurrentAndRecentText() || "";
          if (recentSpoken && isAcousticEcho(finalText, recentSpoken)) {
            console.log("[TwinVoice] Discarded acoustic speaker echo:", finalText);
            return;
          }

          const isSpeakingOrThinking =
            voiceStateRef.current === "SPEAKING" ||
            voiceStateRef.current === "THINKING" ||
            ttsPipelinerRef.current?.isActive();

          if (isSpeakingOrThinking) {
            // Check if this is an explicit stop / interruption command
            if (isInterruptionIntent(finalText)) {
              if (isStopOnlyIntent(finalText)) {
                interrupt({ isStopOnly: true });
                return;
              } else {
                // Conversational barge-in with follow-up query
                interrupt({ isStopOnly: false });
                setVoiceState("TRANSCRIBING");
                processSpokenUtteranceRef.current(finalText);
                return;
              }
            }

            // Discard any assistant speaker audio heard while speaking
            console.log("[TwinVoice] Discarded assistant speech echo while speaking:", finalText);
            return;
          }

          // In normal listening mode: check if this is an explicit stop command
          if (isInterruptionIntent(finalText)) {
            if (isStopOnlyIntent(finalText)) {
              interrupt({ isStopOnly: true });
              return;
            }
          }

          setVoiceState("TRANSCRIBING");
          processSpokenUtteranceRef.current(finalText);
        },
        onError: (err) => {
          if (sessionTurnId !== currentTurnIdRef.current) return;
          if (err.type === "MIC_PERMISSION_DENIED") {
            setHasMicPermission(false);
          }
          if (!isBargeIn) {
            setError(err);
            setVoiceState("ERROR");
            cognitiveTriggerError();
          }
        },
        onEnd: () => {
          if (sessionTurnId !== currentTurnIdRef.current) return;

          if (voiceStateRef.current === "SPEAKING" || voiceStateRef.current === "THINKING") {
            // Keep microphone alive for barge-in while speech output continues
            startListeningRef.current({ isBargeIn: true });
          } else if (voiceStateRef.current === "LISTENING") {
            setVoiceState("IDLE");
            cognitiveSetIdle();
            localWakeWord.resumeAfterVoiceSession();
          }
        },
      });
    },
    [
      interrupt,
      setVoiceState,
      cognitiveStartListening,
      cognitiveSetIdle,
      cognitiveTriggerError,
      recordActivity,
      cleanupContinuousVerifier,
      handleImmediateGuestDemotion,
      settings.language,
      trust,
    ],
  );

  // Stop Listening gracefully
  const stopListening = useCallback(() => {
    sttEngineRef.current?.stop();
  }, []);

  // Cancel Listening immediately
  const cancelListening = useCallback(() => {
    if (voiceBiometricRecorderRef.current) {
      voiceBiometricRecorderRef.current.cleanup();
      voiceBiometricRecorderRef.current = null;
    }
    sttEngineRef.current?.abort();
    setInterimTranscript("");
    setIsAnalyzingLanguage(false);
    setError(null);
    setVoiceState("IDLE");
    cognitiveSetIdle();
    localWakeWord.resumeAfterVoiceSession();
  }, [setVoiceState, cognitiveSetIdle]);

  // Open & Close Modal
  const openVoiceModal = useCallback(() => {
    recordActivity?.();
    setIsVoiceModalOpen(true);
    setError(null);
    if (voiceStateRef.current === "IDLE" || voiceStateRef.current === "ERROR") {
      startListeningRef.current();
    }
  }, [recordActivity]);

  // Synchronize dynamic action references safely in effect
  useEffect(() => {
    processSpokenUtteranceRef.current = processSpokenUtterance;
    startListeningRef.current = startListening;
    openVoiceModalRef.current = openVoiceModal;
  }, [processSpokenUtterance, startListening, openVoiceModal]);

  const closeVoiceModal = useCallback(() => {
    setIsVoiceModalOpen(false);
    setIsAnalyzingLanguage(false);
    setError(null);
    if (voiceStateRef.current === "LISTENING") {
      cancelListening();
    } else if (voiceStateRef.current === "SPEAKING") {
      ttsPipelinerRef.current?.cancel();
      setVoiceState("IDLE");
      cognitiveSetIdle();
    } else if (voiceStateRef.current === "ERROR") {
      setVoiceState("IDLE");
      cognitiveSetIdle();
    }
    localWakeWord.resumeAfterVoiceSession();
  }, [cancelListening, setVoiceState, cognitiveSetIdle]);

  const toggleVoiceModal = useCallback(() => {
    if (isVoiceModalOpen) {
      closeVoiceModal();
    } else {
      openVoiceModal();
    }
  }, [isVoiceModalOpen, openVoiceModal, closeVoiceModal]);

  // Toggle Wake-Word Detection
  const toggleWakeWord = useCallback(() => {
    const nextVal = !settings.wakeWordEnabled;
    updateSettings({ wakeWordEnabled: nextVal });

    localWakeWord.setEnabled(nextVal, {
      onWake: () => {
        recordActivity?.();
        openVoiceModalRef.current();
        lastVerifiedSpeakerResultRef.current = null;
        startListeningRef.current();
      },
      onListeningStateChange: (active) => {
        setIsWakeWordListening(active);
      },
      onError: (err) => {
        console.warn("[TwinVoice WakeWord]", err);
      },
    });
  }, [settings.wakeWordEnabled, updateSettings, recordActivity]);

  // Initialize Wake Word on mount if previously enabled
  useEffect(() => {
    if (settings.wakeWordEnabled && isSpeechRecognitionSupported()) {
      localWakeWord.setEnabled(true, {
        onWake: () => {
          recordActivity?.();
          setIsVoiceModalOpen(true);
          lastVerifiedSpeakerResultRef.current = null;
          startListeningRef.current();
        },
        onListeningStateChange: (active) => {
          setIsWakeWordListening(active);
        },
      });
    }

    return () => {
      cleanupContinuousVerifier();
      if (voiceBiometricRecorderRef.current) {
        voiceBiometricRecorderRef.current.cleanup();
        voiceBiometricRecorderRef.current = null;
      }
      localWakeWord.stop();
      sttEngineRef.current?.abort();
      ttsPipelinerRef.current?.cancel();
    };
  }, [settings.wakeWordEnabled, recordActivity, cleanupContinuousVerifier]);

  // Synchronize Voice Enrollment state: pause wake word and halt any ongoing assistant listening
  useEffect(() => {
    if (trust?.isVoiceEnrolling) {
      localWakeWord.pauseForVoiceSession();
      if (sttEngineRef.current?.isRunning()) {
        sttEngineRef.current.stop();
      }
      if (voiceStateRef.current !== "IDLE") {
        setVoiceState("IDLE");
        cognitiveSetIdle();
      }
    } else {
      localWakeWord.resumeAfterVoiceSession();
    }
  }, [trust?.isVoiceEnrolling, cognitiveSetIdle, setVoiceState]);

  return (
    <VoiceContext.Provider
      value={{
        voiceState,
        transcript,
        interimTranscript,
        detectedLanguage,
        isAnalyzingLanguage,
        isVoiceModalOpen,
        isWakeWordEnabled: settings.wakeWordEnabled,
        isWakeWordListening,
        hasMicPermission,
        error,
        settings,
        availableVoices,
        selectedVoiceMetadata,
        isPreviewPlaying,
        previewVoice,
        stopPreview,
        updateSettings,
        openVoiceModal,
        closeVoiceModal,
        toggleVoiceModal,
        toggleWakeWord,
        startListening,
        stopListening,
        cancelListening,
        interrupt,
        processSpokenUtterance,
        registerChatHandlers,
        unregisterChatHandlers,
        feedStreamDeltaToVoice,
        setTurnLanguageVoice,
        finishStreamVoice,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useTwinVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useTwinVoice must be used within a VoiceProvider");
  }
  return context;
}
