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
import { SpeechToTextEngine, isSpeechRecognitionSupported } from "../lib/voice/speechToText";
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
  isAcousticEcho,
} from "../lib/voice/voiceCommandRouter";
import { useCognitiveActivity } from "./CognitiveContext";
import { safeStorage, STORAGE_KEYS } from "../lib/storage";
import { useOptionalTrust } from "./TrustContext";

interface VoiceContextType {
  voiceState: VoiceState;
  transcript: string;
  interimTranscript: string;
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
  interrupt: () => void;
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
        silenceTimeoutMs: settings.autoSendDelayMs > 0 ? settings.autoSendDelayMs : 2200,
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
      if (!sttEngineRef.current?.isRunning()) {
        startListeningRef.current({ isBargeIn: true });
      }
    }
  }, [isVoiceModalOpen, recordActivity]);

  const setTurnLanguageVoice = useCallback((targetLang: "hi" | "en-IN" | "en") => {
    ttsPipelinerRef.current?.setTurnLanguage(targetLang);
  }, []);

  const finishStreamVoice = useCallback(() => {
    if (isVoiceModalOpen || voiceStateRef.current === "THINKING" || voiceStateRef.current === "SPEAKING") {
      ttsPipelinerRef.current?.finishStream();
    }
  }, [isVoiceModalOpen]);

  // Barge-in / Interrupt Action
  const interrupt = useCallback(() => {
    // If not active, nothing to interrupt
    if (voiceStateRef.current === "IDLE" && !ttsPipelinerRef.current?.active) {
      return;
    }

    // 1. Cancel speech synthesis immediately
    ttsPipelinerRef.current?.cancel();

    // 2. Abort any active SSE chat stream
    chatHandlersRef.current?.abortChatStream();

    // 3. Abort STT instance so the interruption keyword ("stop") is not treated as a new prompt
    sttEngineRef.current?.abort();

    // 4. Play soft descent audio cue
    if (settings.soundEffectsEnabled) {
      soundEffects.playInterruptChirp();
    }

    // 5. Quick visual contraction
    cognitiveTriggerInterrupted();
    setVoiceState("INTERRUPTED");
    setInterimTranscript("");

    // 6. Instantly resume listening for new user speech
    setTimeout(() => {
      startListeningRef.current();
    }, 150);
  }, [settings.soundEffectsEnabled, cognitiveTriggerInterrupted, setVoiceState]);

  // Process a finalized spoken utterance
  const processSpokenUtterance = useCallback(
    async (utterance: string, attachmentFile?: File) => {
      recordActivity?.();
      const trimmed = utterance.trim();
      if (!trimmed && !attachmentFile) {
        setVoiceState("IDLE");
        cognitiveSetIdle();
        localWakeWord.resumeAfterVoiceSession();
        return;
      }

      setTranscript(trimmed);
      setInterimTranscript("");
      setVoiceState("THINKING");
      cognitiveStartThinking();

      // Route through Voice Command Router
      const command: ParsedVoiceCommand = routeVoiceCommand(trimmed);

      // Handle Command Intents
      if (command.intent === "STOP_GENERATION") {
        interrupt();
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
      // Keep microphone active in barge-in mode so user can interrupt at any point
      setTimeout(() => {
        if (voiceStateRef.current === "THINKING" || voiceStateRef.current === "SPEAKING") {
          startListeningRef.current({ isBargeIn: true });
        }
      }, 80);
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
    ],
  );

  // Start Listening (supports normal listening and background barge-in listening)
  const startListening = useCallback(
    async (options?: { isBargeIn?: boolean }): Promise<void> => {
      recordActivity?.();
      const isBargeIn = options?.isBargeIn ?? false;

      // If user clicked listening button while speaking/thinking, interrupt immediately
      if (!isBargeIn && (voiceStateRef.current === "SPEAKING" || voiceStateRef.current === "THINKING")) {
        interrupt();
        return;
      }

      setError(null);
      setInterimTranscript("");
      localWakeWord.pauseForVoiceSession();

      // Give browser audio pipeline a brief buffer to release background wake-word listener
      await new Promise((resolve) => setTimeout(resolve, 80));

      if (!sttEngineRef.current) return;

      if (!isBargeIn) {
        setVoiceState("LISTENING");
        cognitiveStartListening();
      }

      await sttEngineRef.current.start({
        onStart: () => {
          setHasMicPermission(true);
          if (!isBargeIn && voiceStateRef.current !== "SPEAKING" && voiceStateRef.current !== "THINKING") {
            setVoiceState("LISTENING");
            cognitiveStartListening();
          }
        },
        onInterimTranscript: (text) => {
          const isSpeakingOrThinking =
            voiceStateRef.current === "SPEAKING" || voiceStateRef.current === "THINKING";

          if (isSpeakingOrThinking) {
            if (isInterruptionIntent(text)) {
              // Real-time barge-in interruption detected! Stop playback immediately!
              interrupt();
              return;
            }
          } else {
            setInterimTranscript(text);
          }
        },
        onFinalTranscript: (finalText) => {
          const isSpeakingOrThinking =
            voiceStateRef.current === "SPEAKING" || voiceStateRef.current === "THINKING";

          if (isSpeakingOrThinking) {
            if (isInterruptionIntent(finalText)) {
              interrupt();
              return;
            }

            // Check if this is an acoustic echo of what TwinMind is currently speaking
            const currentSpoken = ttsPipelinerRef.current?.getCurrentSpokenSentence() || "";
            const allSpoken = ttsPipelinerRef.current?.getAllCurrentText() || "";
            if (isAcousticEcho(finalText, currentSpoken) || isAcousticEcho(finalText, allSpoken)) {
              // Discard speaker echo and continue listening for real user speech
              if (voiceStateRef.current === "SPEAKING" || voiceStateRef.current === "THINKING") {
                startListeningRef.current({ isBargeIn: true });
              }
              return;
            }

            // Conversational barge-in: user spoke a new substantive utterance while TwinMind was answering
            interrupt();
            setVoiceState("TRANSCRIBING");
            processSpokenUtteranceRef.current(finalText);
          } else {
            setVoiceState("TRANSCRIBING");
            processSpokenUtteranceRef.current(finalText);
          }
        },
        onError: (err) => {
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
    ],
  );

  // Stop Listening gracefully
  const stopListening = useCallback(() => {
    sttEngineRef.current?.stop();
  }, []);

  // Cancel Listening immediately
  const cancelListening = useCallback(() => {
    sttEngineRef.current?.abort();
    setInterimTranscript("");
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
      onWake: (trailingSpeech) => {
        recordActivity?.();
        openVoiceModalRef.current();
        if (trailingSpeech) {
          processSpokenUtteranceRef.current(trailingSpeech);
        } else {
          startListeningRef.current();
        }
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
        onWake: (trailingSpeech) => {
          recordActivity?.();
          setIsVoiceModalOpen(true);
          if (trailingSpeech) {
            processSpokenUtteranceRef.current(trailingSpeech);
          } else {
            startListeningRef.current();
          }
        },
        onListeningStateChange: (active) => {
          setIsWakeWordListening(active);
        },
      });
    }

    return () => {
      localWakeWord.stop();
      sttEngineRef.current?.abort();
      ttsPipelinerRef.current?.cancel();
    };
  }, [settings.wakeWordEnabled, recordActivity]);

  return (
    <VoiceContext.Provider
      value={{
        voiceState,
        transcript,
        interimTranscript,
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
