/**
 * TwinVoice™ — Text-to-Speech (TTS) & Streaming Sentence Pipeliner
 *
 * Implements sentence-boundary pipelining: audio playback starts on the first
 * completed sentence as Gemini SSE chunks arrive, providing sub-400ms voice latency.
 * Supports instant barge-in cancellation and Web Audio sound effects.
 */

import { VoiceErrorInfo, VoiceSettings } from "../../types/voice";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Returns available voices from browser SpeechSynthesis, sorted by natural quality.
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices.sort((a, b) => {
    // Prioritize natural / online / Google / Apple voices
    const isNaturalA = a.name.includes("Natural") || a.name.includes("Google") || a.name.includes("Siri");
    const isNaturalB = b.name.includes("Natural") || b.name.includes("Google") || b.name.includes("Siri");
    if (isNaturalA && !isNaturalB) return -1;
    if (!isNaturalA && isNaturalB) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Selects the highest quality natural voice available, with support for language targeting.
 */
export function getLanguageMatchedVoice(
  voices: SpeechSynthesisVoice[],
  targetLang: "hi" | "en-IN" | "en",
  preferredUri?: string | null,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  if (preferredUri) {
    const found = voices.find((v) => v.voiceURI === preferredUri);
    if (found) return found;
  }

  // 1. Hindi Voice (Devanagari)
  if (targetLang === "hi") {
    const hindiVoice = voices.find(
      (v) =>
        v.lang.startsWith("hi") &&
        (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Swara") || v.name.includes("Kalpana")),
    ) || voices.find((v) => v.lang.startsWith("hi"));
    if (hindiVoice) return hindiVoice;
  }

  // 2. Indian English (Optimal for Roman Hinglish)
  if (targetLang === "en-IN") {
    const indianVoice = voices.find(
      (v) =>
        (v.lang === "en-IN" || v.lang === "en_IN") &&
        (v.name.includes("Natural") || v.name.includes("Neerja") || v.name.includes("Google")),
    ) || voices.find((v) => v.lang === "en-IN" || v.lang === "en_IN");
    if (indianVoice) return indianVoice;
  }

  // 3. High quality natural English voices
  const naturalEnglish = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      (v.name.includes("Natural") ||
        v.name.includes("Google US English") ||
        v.name.includes("Samantha") ||
        v.name.includes("Jenny") ||
        v.name.includes("Guy") ||
        v.name.includes("Aria")),
  );
  if (naturalEnglish) return naturalEnglish;

  // 4. Fallback to any English voice
  const english = voices.find((v) => v.lang.startsWith("en"));
  return english || voices[0] || null;
}

/**
 * Selects the highest quality natural voice available.
 */
export function getDefaultNaturalVoice(
  preferredUri?: string | null,
  langPreference?: string,
): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  if (voices.length === 0) return null;

  const target = langPreference === "hi" ? "hi" : langPreference === "hinglish" ? "en-IN" : "en";
  return getLanguageMatchedVoice(voices, target, preferredUri);
}

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const HINGLISH_MARKERS = /\b(kal|kya|kar|karo|raha|rahi|rahe|tha|thi|the|batao|kaam|kaise|mera|meri|mere|aap|aapne|hum|maine|nahi|kyun|kahan|kab|shuru|kholo|ruko|achha|theek|madad)\b/i;

export function detectScriptAndLanguage(
  text: string,
  userPreference: VoiceSettings["language"] = "auto",
): { lang: string; voiceTarget: "hi" | "en-IN" | "en" } {
  // If Devanagari script is detected, MUST use Hindi voice/locale
  if (DEVANAGARI_REGEX.test(text)) {
    return { lang: "hi-IN", voiceTarget: "hi" };
  }

  // Explicit user preference
  if (userPreference === "hi") {
    return { lang: "hi-IN", voiceTarget: "hi" };
  }
  if (userPreference === "hinglish") {
    return { lang: "en-IN", voiceTarget: "en-IN" };
  }
  if (userPreference === "en") {
    return { lang: "en-US", voiceTarget: "en" };
  }

  // Auto-detection from content
  if (HINGLISH_MARKERS.test(text)) {
    return { lang: "en-IN", voiceTarget: "en-IN" };
  }

  return { lang: "en-US", voiceTarget: "en" };
}

export interface TTSCallbacks {
  onStart?: () => void;
  onSentenceStart?: (sentence: string, index: number) => void;
  onSentenceEnd?: (sentence: string, index: number) => void;
  onAllFinished?: () => void;
  onInterrupted?: () => void;
  onError?: (err: VoiceErrorInfo) => void;
}

/**
 * StreamingTextToSpeechPipeliner:
 * Ingests incremental text deltas, partitions into sentences, and pipelines audio sequentially.
 */
export class StreamingTextToSpeechPipeliner {
  private sentenceQueue: string[] = [];
  private currentBuffer = "";
  private isSpeaking = false;
  private isInterrupted = false;
  private isStreamFinished = false;
  private sentenceIndex = 0;
  private settings: VoiceSettings;
  private callbacks: TTSCallbacks;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor(settings: VoiceSettings, callbacks: TTSCallbacks = {}) {
    this.settings = settings;
    this.callbacks = callbacks;
    this.selectedVoice = getDefaultNaturalVoice(settings.voiceUri);
  }

  public updateSettings(newSettings: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.voiceUri !== undefined || newSettings.language !== undefined) {
      this.selectedVoice = getDefaultNaturalVoice(this.settings.voiceUri, this.settings.language);
    }
  }

  /**
   * Feed incoming token / text delta from Gemini SSE stream.
   */
  public feedDelta(delta: string): void {
    if (this.isInterrupted || !isSpeechSynthesisSupported() || this.settings.voiceResponseEnabled === false) return;

    this.currentBuffer += delta;

    // Sentence splitting regex: look for punctuation followed by space or newline
    const sentenceEndRegex = /([.?!:\n]+)\s+/;
    let match: RegExpExecArray | null;

    while ((match = sentenceEndRegex.exec(this.currentBuffer)) !== null) {
      const sentenceEndIndex = match.index + match[1].length;
      const sentence = this.currentBuffer.slice(0, sentenceEndIndex).trim();
      this.currentBuffer = this.currentBuffer.slice(sentenceEndIndex).trimStart();

      if (sentence.length > 0) {
        this.enqueueSentence(sentence);
      }
    }
  }

  /**
   * Signals that Gemini SSE streaming is complete; flushes remaining buffer.
   */
  public finishStream(): void {
    if (this.isInterrupted) return;
    this.isStreamFinished = true;

    const remaining = this.currentBuffer.trim();
    if (remaining.length > 0) {
      this.currentBuffer = "";
      this.enqueueSentence(remaining);
    } else if (this.sentenceQueue.length === 0 && !this.isSpeaking) {
      this.callbacks.onAllFinished?.();
    }
  }

  /**
   * Enqueues a sentence and starts processing if idle.
   */
  private enqueueSentence(sentence: string): void {
    if (this.settings.voiceResponseEnabled === false) return;
    // Clean markdown symbols (e.g. *bold*, # header, `code`) for natural reading
    const sanitized = sanitizeTextForSpeech(sentence);
    if (!sanitized) return;

    this.sentenceQueue.push(sanitized);

    if (!this.isSpeaking) {
      this.playNext();
    }
  }

  /**
   * Plays the next sentence in the queue.
   */
  private playNext(): void {
    if (
      this.isInterrupted ||
      !isSpeechSynthesisSupported() ||
      this.settings.voiceResponseEnabled === false
    ) {
      this.isSpeaking = false;
      return;
    }

    if (this.sentenceQueue.length === 0) {
      this.isSpeaking = false;
      if (this.isStreamFinished) {
        this.callbacks.onAllFinished?.();
      }
      return;
    }

    const nextSentence = this.sentenceQueue.shift()!;
    const currentIndex = this.sentenceIndex++;

    try {
      const { lang: targetLocale, voiceTarget } = detectScriptAndLanguage(
        nextSentence,
        this.settings.language,
      );
      const voices = getAvailableVoices();
      const matchedVoice = getLanguageMatchedVoice(voices, voiceTarget, this.settings.voiceUri);

      const utterance = new SpeechSynthesisUtterance(nextSentence);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      } else if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.lang = targetLocale;
      utterance.rate = this.settings.speechRate || 1.0;
      utterance.pitch = this.settings.speechPitch || 1.0;
      utterance.volume = this.settings.speechVolume ?? 1.0;

      utterance.onstart = () => {
        if (currentIndex === 0) {
          this.callbacks.onStart?.();
        }
        this.isSpeaking = true;
        this.callbacks.onSentenceStart?.(nextSentence, currentIndex);
      };

      utterance.onend = () => {
        this.callbacks.onSentenceEnd?.(nextSentence, currentIndex);
        // Small pause between sentences for organic cadence
        setTimeout(() => {
          this.playNext();
        }, 60);
      };

      utterance.onerror = (e) => {
        // 'canceled' or 'interrupted' is expected on barge-in
        if (e.error !== "canceled" && e.error !== "interrupted") {
          this.callbacks.onError?.({
            type: "TTS_FAILURE",
            message: `Speech synthesis failed: ${e.error}`,
            originalError: e,
          });
        }
        this.playNext();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      this.isSpeaking = false;
      this.callbacks.onError?.({
        type: "TTS_FAILURE",
        message: "Failed to synthesize speech utterance.",
        originalError: err,
      });
    }
  }

  /**
   * Instantly stops audio playback and clears the pipeline (barge-in / cancel).
   */
  public cancel(): void {
    this.isInterrupted = true;
    this.sentenceQueue = [];
    this.currentBuffer = "";
    this.isSpeaking = false;

    if (isSpeechSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }

    this.callbacks.onInterrupted?.();
  }

  public get active(): boolean {
    return this.isSpeaking;
  }
}

/**
 * Strips markdown and special characters so TTS reads smoothly and naturally.
 */
export function sanitizeTextForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")       // bold
    .replace(/\*(.*?)\*/g, "$1")           // italic
    .replace(/__(.*?)__/g, "$1")           // underline
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")   // inline/fenced code
    .replace(/#+\s+/g, "")                 // headings
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")    // links
    .replace(/[-*•]\s+/g, "")              // bullets
    .replace(/\n+/g, " ")                  // newlines to spaces
    .replace(/\s{2,}/g, " ")               // multiple spaces
    .trim();
}

/**
 * Web Audio Harmonic Tone Synthesizer:
 * Generates pleasant acoustic chimes for wake word, listening, and interruption.
 */
export class SoundEffectsSynthesizer {
  private audioCtx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Plays gentle ascending chime when "Hey TwinMind" wake word is detected (C5 -> E5).
   */
  public playWakeChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Tone 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      // Tone 2: E5 (659.25 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now + 0.12);
      gain2.gain.setValueAtTime(0.15, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.38);
    } catch {
      // Audio playback failed or blocked by autoplay
    }
  }

  /**
   * Plays brief confirmation chirp on send/success.
   */
  public playSuccessChirp(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Ignore
    }
  }

  /**
   * Plays soft descent chirp on barge-in / interrupt.
   */
  public playInterruptChirp(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore
    }
  }

  public cleanup(): void {
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // Ignore
      }
      this.audioCtx = null;
    }
  }
}

export const soundEffects = new SoundEffectsSynthesizer();

