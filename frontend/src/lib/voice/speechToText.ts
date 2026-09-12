/**
 * TwinVoice™ — Speech-to-Text (STT) Client Engine
 *
 * Implements token-by-token streaming speech recognition via Web Speech API
 * with audio recording fallback to server-side Gemini transcription.
 */

import { VoiceErrorInfo, VoiceErrorType } from "../../types/voice";
import { getAuthToken } from "../api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Browser SpeechRecognition interface typing
export interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognitionInstance;
}

export interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

export interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface IWindowSpeechRecognition {
  SpeechRecognition?: ISpeechRecognitionConstructor;
  webkitSpeechRecognition?: ISpeechRecognitionConstructor;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as IWindowSpeechRecognition;
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export interface STTCallbacks {
  onStart?: () => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onError?: (err: VoiceErrorInfo) => void;
  onEnd?: () => void;
}

export interface STTOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  silenceTimeoutMs?: number; // Auto-stop after N ms of trailing silence (e.g. 2000ms)
}

export class SpeechToTextEngine {
  private recognition: ISpeechRecognitionInstance | null = null;
  private isListening = false;
  private accumulatedFinalText = "";
  private currentInterimText = "";
  private silenceTimer: NodeJS.Timeout | null = null;
  private callbacks: STTCallbacks | null = null;
  private options: STTOptions;

  constructor(options: STTOptions = {}) {
    this.options = {
      continuous: true,
      interimResults: true,
      lang: "en-US",
      silenceTimeoutMs: 2200,
      ...options,
    };
  }

  public updateOptions(newOptions: Partial<STTOptions>): void {
    this.options = { ...this.options, ...newOptions };
    if (this.recognition && newOptions.lang) {
      try {
        this.recognition.lang = newOptions.lang;
      } catch {
        // Ignore
      }
    }
  }

  public setLanguage(langPreference: "auto" | "en" | "hi" | "hinglish"): void {
    const code =
      langPreference === "hi"
        ? "hi-IN"
        : langPreference === "hinglish"
        ? "en-IN"
        : langPreference === "en"
        ? "en-US"
        : typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";
    this.updateOptions({ lang: code });
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    const timeout = this.options.silenceTimeoutMs;
    if (timeout && timeout > 0) {
      this.silenceTimer = setTimeout(() => {
        if (this.isListening && (this.accumulatedFinalText || this.currentInterimText)) {
          this.stop();
        }
      }, timeout);
    }
  }

  public async start(callbacks: STTCallbacks): Promise<void> {
    this.clearSilenceTimer();

    // Safely tear down any existing recognition instance and detach handlers
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
      // Allow browser audio engine a brief moment to tear down previous session
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    this.callbacks = callbacks;
    this.accumulatedFinalText = "";
    this.currentInterimText = "";

    if (!isSpeechRecognitionSupported()) {
      callbacks.onError?.({
        type: "BROWSER_UNSUPPORTED",
        message: "Speech recognition is not natively supported in this browser. Please use Chrome, Edge, or Safari.",
      });
      return;
    }

    const win = window as unknown as IWindowSpeechRecognition;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      callbacks.onError?.({
        type: "BROWSER_UNSUPPORTED",
        message: "Speech recognition is not natively supported in this browser. Please use Chrome, Edge, or Safari.",
      });
      return;
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = this.options.continuous ?? true;
      this.recognition.interimResults = this.options.interimResults ?? true;
      this.recognition.lang = this.options.lang || "en-US";
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.callbacks?.onStart?.();
        this.resetSilenceTimer();
      };

      this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
        let interim = "";
        let newFinal = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcriptChunk = result[0]?.transcript || "";
          if (result.isFinal) {
            newFinal += transcriptChunk + " ";
          } else {
            interim += transcriptChunk;
          }
        }

        if (newFinal) {
          this.accumulatedFinalText += newFinal;
          this.currentInterimText = "";
        } else {
          this.currentInterimText = interim;
        }

        const fullCurrent = (this.accumulatedFinalText + (interim ? " " + interim : "")).trim();
        this.callbacks?.onInterimTranscript?.(fullCurrent);
        this.resetSilenceTimer();
      };

      this.recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        this.clearSilenceTimer();

        // Harmless non-fatal events:
        // 1. "no-speech": user stayed silent
        // 2. "aborted": recognition was stopped, aborted, or superseded
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }

        const errType: VoiceErrorType =
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "MIC_PERMISSION_DENIED"
            : event.error === "audio-capture"
            ? "MIC_NOT_AVAILABLE"
            : event.error === "network"
            ? "NETWORK_FAILURE"
            : "STT_FAILURE";

        const errMessage =
          event.error === "not-allowed"
            ? "Microphone access was denied. Please allow microphone permissions in your browser."
            : event.error === "audio-capture"
            ? "No microphone was detected on this device."
            : event.error === "network"
            ? "Speech recognition network error. Please check your connection."
            : `Speech recognition error: ${event.error || "unknown"}`;

        this.callbacks?.onError?.({
          type: errType,
          message: errMessage,
          originalError: event,
        });
      };

      this.recognition.onend = () => {
        this.clearSilenceTimer();
        this.isListening = false;

        const finalResult = (this.accumulatedFinalText + " " + this.currentInterimText).trim();
        if (finalResult) {
          this.callbacks?.onFinalTranscript(finalResult);
        }
        this.callbacks?.onEnd?.();
      };

      this.recognition.start();
    } catch (err: unknown) {
      this.clearSilenceTimer();
      this.isListening = false;
      const message = err instanceof Error ? err.message : String(err);
      callbacks.onError?.({
        type: "STT_FAILURE",
        message: `Failed to initialize microphone: ${message}`,
        originalError: err,
      });
    }
  }

  public stop(): void {
    this.clearSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore if already stopped
      }
    }
  }

  public abort(): void {
    this.clearSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
    this.isListening = false;
    this.accumulatedFinalText = "";
    this.currentInterimText = "";
  }

  public get isActive(): boolean {
    return this.isListening;
  }
}

/**
 * AudioRecorder: Fallback audio capture using MediaRecorder
 * for sending audio to backend `/api/voice/transcribe`.
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;

  public async start(): Promise<void> {
    this.audioChunks = [];
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Audio capture is not supported on this device/browser.");
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
      ? "audio/ogg;codecs=opus"
      : "audio/webm";

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };
    this.mediaRecorder.start(250); // collect 250ms slices
  }

  public async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error("MediaRecorder is not initialized"));
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        // Clean up media tracks
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        this.mediaRecorder = null;
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public cleanup(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}

/**
 * Uploads audio blob to backend `/api/voice/transcribe`
 */
export async function transcribeAudioOnServer(audioBlob: Blob): Promise<string> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/voice/transcribe`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Audio transcription failed with status ${res.status}`);
  }

  const json = await res.json();
  return json.data?.transcript || "";
}

