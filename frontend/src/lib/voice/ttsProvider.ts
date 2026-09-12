/**
 * TwinVoice™ — TTS Provider Abstraction & Web Speech Provider
 *
 * Implements a provider abstraction for Speech Synthesis, allowing dynamic
 * discovery of genuine browser/OS voices, rich metadata profiling, previewing,
 * and seamless fallback across languages (English, Hindi, Hinglish).
 */

import { VoiceMetadata, VoiceLanguagePreference } from "../../types/voice";

export interface TTSOptions {
  voiceId?: string | null;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  getVoices(): Promise<VoiceMetadata[]>;
  synthesize(text: string, options?: TTSOptions): Promise<void>;
  stop(): void;
  supportedLanguages(): string[];
}

/**
 * Returns user-friendly style classification based on voice name and attributes.
 */
function classifyVoiceStyle(
  voiceName: string,
  gender: "female" | "male" | "neutral",
): "Conversational" | "Professional" | "Calm" | "Energetic" | "Warm" {
  const lower = voiceName.toLowerCase();
  if (lower.includes("aria") || lower.includes("jenny") || lower.includes("zira")) {
    return "Conversational";
  }
  if (lower.includes("guy") || lower.includes("david") || lower.includes("mark")) {
    return "Professional";
  }
  if (lower.includes("swara") || lower.includes("neerja") || lower.includes("samantha")) {
    return "Warm";
  }
  if (lower.includes("natural") || lower.includes("online")) {
    return "Calm";
  }
  return gender === "female" ? "Warm" : "Professional";
}

/**
 * Formats user-friendly display name from raw browser voice name.
 * e.g., "Microsoft Aria Online (Natural) - English (United States)" -> "Aria (Natural)"
 */
function formatVoiceDisplayName(rawName: string, lang: string): string {
  let cleaned = rawName
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s*Online\s*/gi, " ")
    .replace(/\s*-\s*English.*$/i, "")
    .replace(/\s*-\s*Hindi.*$/i, "")
    .replace(/\s*\([^)]*United States[^)]*\)/gi, "")
    .replace(/\s*\([^)]*India[^)]*\)/gi, "")
    .trim();

  if (cleaned.includes("(Natural)")) {
    cleaned = cleaned.replace(/\(Natural\)/g, "").trim() + " (Natural)";
  }

  // If name is raw locale code, give it a friendly name
  if (!cleaned || cleaned.length < 2) {
    if (lang.startsWith("hi")) return "Hindi Voice";
    if (lang === "en-IN") return "Indian English Voice";
    return "System Voice";
  }

  return cleaned;
}

/**
 * Maps raw locale code to human-readable label.
 */
function formatLanguageLabel(lang: string): string {
  if (lang === "hi-IN" || lang === "hi") return "Hindi (India)";
  if (lang === "en-IN") return "English (India / Hinglish)";
  if (lang === "en-US") return "English (US)";
  if (lang === "en-GB") return "English (UK)";
  if (lang.startsWith("en")) return "English";
  if (lang.startsWith("hi")) return "Hindi";
  return lang;
}

/**
 * Generates descriptive bio for the voice based on style, region, and qualities.
 */
function getVoiceDescription(
  name: string,
  style: "Conversational" | "Professional" | "Calm" | "Energetic" | "Warm",
  lang: string,
): string {
  if (lang.startsWith("hi")) {
    return "Fluid native Hindi pronunciation and natural Devanagari cadence";
  }
  if (lang === "en-IN") {
    return "Natural Indian conversational inflection, optimal for Hinglish";
  }
  switch (style) {
    case "Conversational":
      return "Friendly, organic, and engaging conversational tone";
    case "Professional":
      return "Clear, articulate, and focused communication";
    case "Calm":
      return "Soft, composed, and relaxed delivery";
    case "Energetic":
      return "Enthusiastic, bright, and proactive cadence";
    case "Warm":
    default:
      return "Warm, natural, and approachable presence";
  }
}

/**
 * WebSpeechTTSProvider: Implements the TTSProvider interface utilizing
 * the browser's native window.speechSynthesis engine.
 */
export class WebSpeechTTSProvider implements TTSProvider {
  public readonly id = "web-speech";
  public readonly name = "Web Speech Native";
  private voiceCache: VoiceMetadata[] | null = null;

  public isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /**
   * Retrieves genuine available voices from the browser and caches them with metadata.
   */
  public async getVoices(): Promise<VoiceMetadata[]> {
    if (!this.isSupported()) return [];

    const rawVoices = await this.fetchRawVoices();
    if (rawVoices.length === 0) return [];

    const mapped: VoiceMetadata[] = rawVoices
      .filter((v) => v.lang.startsWith("en") || v.lang.startsWith("hi"))
      .map((v) => {
        const lowerName = v.name.toLowerCase();
        const gender: "female" | "male" | "neutral" =
          lowerName.includes("female") ||
          lowerName.includes("aria") ||
          lowerName.includes("jenny") ||
          lowerName.includes("zira") ||
          lowerName.includes("swara") ||
          lowerName.includes("neerja") ||
          lowerName.includes("samantha") ||
          lowerName.includes("karen")
            ? "female"
            : lowerName.includes("male") ||
              lowerName.includes("guy") ||
              lowerName.includes("david") ||
              lowerName.includes("mark") ||
              lowerName.includes("madhur") ||
              lowerName.includes("prabhat")
            ? "male"
            : "neutral";

        const isNatural =
          v.name.includes("Natural") ||
          v.name.includes("Google") ||
          v.name.includes("Online") ||
          v.name.includes("Siri");

        const style = classifyVoiceStyle(v.name, gender);
        const displayName = formatVoiceDisplayName(v.name, v.lang);
        const languageLabel = formatLanguageLabel(v.lang);
        const description = getVoiceDescription(displayName, style, v.lang);

        return {
          id: v.voiceURI,
          displayName,
          gender,
          style,
          lang: v.lang,
          languageLabel,
          description,
          isNatural,
        };
      });

    // Sort: Natural first, Indian English / Hindi prominently accessible, then alphabetically
    mapped.sort((a, b) => {
      if (a.isNatural && !b.isNatural) return -1;
      if (!a.isNatural && b.isNatural) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    this.voiceCache = mapped;
    return mapped;
  }

  /**
   * Waits for voiceschanged event if browser has not populated voices on first tick.
   */
  private fetchRawVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      if (!this.isSupported()) {
        resolve([]);
        return;
      }

      const existing = window.speechSynthesis.getVoices();
      if (existing && existing.length > 0) {
        resolve(existing);
        return;
      }

      const handler = () => {
        const loaded = window.speechSynthesis.getVoices();
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve(loaded);
      };

      window.speechSynthesis.addEventListener("voiceschanged", handler);

      // Fallback timeout in case event does not fire
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve(window.speechSynthesis.getVoices());
      }, 500);
    });
  }

  /**
   * Synthesize single speech utterance.
   */
  public async synthesize(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.isSupported() || !text.trim()) return;

    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text.trim());
        const voices = window.speechSynthesis.getVoices();

        if (options.voiceId) {
          const matchedVoice = voices.find((v) => v.voiceURI === options.voiceId);
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        if (options.lang) {
          utterance.lang = options.lang;
        }

        utterance.rate = options.rate ?? 1.0;
        utterance.pitch = options.pitch ?? 1.0;
        utterance.volume = options.volume ?? 1.0;

        utterance.onstart = () => {
          options.onStart?.();
        };

        utterance.onend = () => {
          options.onEnd?.();
          resolve();
        };

        utterance.onerror = (e) => {
          if (e.error === "canceled" || e.error === "interrupted") {
            resolve();
          } else {
            options.onError?.(e);
            reject(new Error(`Speech synthesis error: ${e.error}`));
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        options.onError?.(err);
        reject(err);
      }
    });
  }

  /**
   * Stops any currently active synthesis.
   */
  public stop(): void {
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  public supportedLanguages(): string[] {
    return ["auto", "en", "hi", "hinglish"];
  }

  /**
   * Plays a sample preview sentence for the given voice and language.
   */
  public async previewVoice(
    voiceId: string | null,
    langPreference: VoiceLanguagePreference = "auto",
    customText?: string,
    onStateChange?: (state: "idle" | "playing" | "error") => void,
  ): Promise<void> {
    this.stop();

    const sampleSentence =
      customText ||
      (langPreference === "hi"
        ? "नमस्ते, मैं ट्विनमाइंड हूँ। मैं आपकी क्या मदद कर सकता हूँ?"
        : langPreference === "hinglish"
        ? "Hi, main TwinMind hoon. Main aapki kya madad kar sakta hoon?"
        : "Hi, I'm TwinMind. How can I help you today?");

    // Appropriate locale hint for synthesis
    const localeHint =
      langPreference === "hi" ? "hi-IN" : langPreference === "hinglish" ? "en-IN" : "en-US";

    onStateChange?.("playing");

    try {
      await this.synthesize(sampleSentence, {
        voiceId,
        lang: localeHint,
        onStart: () => onStateChange?.("playing"),
        onEnd: () => onStateChange?.("idle"),
        onError: () => onStateChange?.("error"),
      });
    } catch {
      onStateChange?.("error");
      setTimeout(() => onStateChange?.("idle"), 2000);
    }
  }
}

export const defaultTTSProvider = new WebSpeechTTSProvider();
