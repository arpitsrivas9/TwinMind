/**
 * TwinVoice™ — Local On-Device Wake-Word Detector
 *
 * Implements continuous, privacy-conscious on-device listening for "Hey TwinMind".
 * Strictly opt-in, zero audio data sent to remote cloud providers while idling.
 */

import { isSpeechRecognitionSupported } from "./speechToText";
import { soundEffects } from "./textToSpeech";

const WAKE_WORD_REGEX = /\b(hey\s+twin\s*mind|okay\s+twin\s*mind|ok\s+twin\s*mind|twin\s*mind|hi\s+twin\s*mind)\b/i;

export interface WakeWordCallbacks {
  onWake: (trailingSpeech: string) => void;
  onListeningStateChange?: (active: boolean) => void;
  onError?: (error: unknown) => void;
}

export class LocalWakeWordDetector {
  private recognition: any = null;
  private isRunning = false;
  private isEnabled = false;
  private isPaused = false;
  private callbacks: WakeWordCallbacks | null = null;
  private restartTimeout: NodeJS.Timeout | null = null;

  constructor() {
    //
  }

  public setEnabled(enabled: boolean, callbacks?: WakeWordCallbacks): void {
    this.isEnabled = enabled;
    if (callbacks) {
      this.callbacks = callbacks;
    }

    if (enabled) {
      this.isPaused = false;
      this.start();
    } else {
      this.stop();
    }
  }

  public start(): void {
    if (!this.isEnabled || this.isRunning || this.isPaused || !isSpeechRecognitionSupported()) return;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    const win = window as any;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    try {
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

      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isRunning = true;
        this.callbacks?.onListeningStateChange?.(true);
      };

      this.recognition.onresult = (event: any) => {
        if (this.isPaused) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0]?.transcript || "";
          const match = WAKE_WORD_REGEX.exec(transcript);

          if (match) {
            // Found wake phrase! Extract any speech spoken after the wake phrase
            const afterWake = transcript.slice(match.index + match[0].length).trim();

            // Play instant acoustic confirmation chime
            soundEffects.playWakeChime();

            // Temporarily pause wake word listener so normal voice mode can take over
            this.pauseForVoiceSession();

            // Notify consumer with trailing utterance
            this.callbacks?.onWake(afterWake);
            return;
          }
        }
      };

      this.recognition.onerror = (e: any) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          this.callbacks?.onError?.(e);
        }
      };

      this.recognition.onend = () => {
        this.isRunning = false;
        this.callbacks?.onListeningStateChange?.(false);

        // Auto-restart ONLY if wake-word detection is still enabled and NOT paused
        if (this.isEnabled && !this.isPaused) {
          this.scheduleRestart(800);
        }
      };

      this.recognition.start();
    } catch (err) {
      this.isRunning = false;
      this.callbacks?.onError?.(err);
    }
  }

  private scheduleRestart(delayMs = 800): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.restartTimeout = setTimeout(() => {
      if (this.isEnabled && !this.isRunning && !this.isPaused) {
        this.start();
      }
    }, delayMs);
  }

  /**
   * Pauses wake-word listener while the user is in an active voice interaction.
   */
  public pauseForVoiceSession(): void {
    this.isPaused = true;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
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
    this.isRunning = false;
    this.callbacks?.onListeningStateChange?.(false);
  }

  /**
   * Resumes wake-word listening after active voice interaction concludes.
   */
  public resumeAfterVoiceSession(): void {
    this.isPaused = false;
    if (this.isEnabled && !this.isRunning) {
      this.scheduleRestart(800);
    }
  }

  public stop(): void {
    this.isEnabled = false;
    this.isPaused = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
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
    this.isRunning = false;
    this.callbacks?.onListeningStateChange?.(false);
  }

  public get active(): boolean {
    return this.isRunning;
  }
}

export const localWakeWord = new LocalWakeWordDetector();
