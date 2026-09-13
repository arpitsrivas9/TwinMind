/**
 * TwinVoice™ — Core Voice Types & State Definitions
 */

export type VoiceState =
  | "IDLE"          // System standby, waiting for activation or wake word
  | "LISTENING"     // Microphone active, capturing user audio/speech tokens
  | "TRANSCRIBING"  // Finalizing transcript or processing audio
  | "THINKING"      // Dispatched to Twin Core, awaiting Gemini response
  | "SPEAKING"      // Synthesizing / streaming audio response to user
  | "INTERRUPTED"   // Barge-in triggered, stopping audio and returning to listening
  | "ERROR";        // Error encountered (permission, network, audio)

export type VoiceErrorType =
  | "MIC_PERMISSION_DENIED"
  | "MIC_NOT_AVAILABLE"
  | "BROWSER_UNSUPPORTED"
  | "STT_FAILURE"
  | "TTS_FAILURE"
  | "NETWORK_FAILURE"
  | "GEMINI_FAILURE"
  | "AUDIO_PLAYBACK_FAILURE"
  | "WAKE_WORD_FAILURE"
  | "VOICE_TIMEOUT"
  | "USER_INTERRUPT";

export interface VoiceErrorInfo {
  type: VoiceErrorType;
  message: string;
  originalError?: unknown;
}

export type VoiceCommandIntent =
  | "NAVIGATE"
  | "NEW_CONVERSATION"
  | "STOP_GENERATION"
  | "REPEAT"
  | "SUMMARIZE"
  | "AGENT_DISPATCH"
  | "VERIFY_OWNER"
  | "CHAT_QUERY";

export interface ParsedVoiceCommand {
  intent: VoiceCommandIntent;
  target?: string;       // e.g. "memory", "settings", "graph", "search", "agents", "chat"
  rawUtterance: string;
  cleanedQuery: string;  // stripped of wake word and navigation verbs
  confidence: number;
}

export type VoiceLanguagePreference = "auto" | "en" | "hi" | "hinglish";
export type VoiceSpeakingStyle = "conversational" | "professional" | "concise" | "friendly";

export interface VoiceMetadata {
  id: string; // voiceURI or provider voice identifier
  displayName: string;
  gender?: "female" | "male" | "neutral";
  style?: "Conversational" | "Professional" | "Calm" | "Energetic" | "Warm";
  lang: string;
  languageLabel: string;
  description: string;
  isNatural?: boolean;
}

export interface VoiceSettings {
  wakeWordEnabled: boolean;
  autoSendDelayMs: number;     // 0 = manual confirm, >0 = auto send after pause (default 1800ms)
  voiceUri: string | null;     // selected TTS voice URI
  speechRate: number;          // 0.8 to 1.5 (default 1.0)
  speechPitch: number;         // 0.8 to 1.2 (default 1.0)
  speechVolume: number;        // 0.0 to 1.0 (default 1.0)
  continuousConversation: boolean; // whether to re-listen after TwinMind finishes speaking
  soundEffectsEnabled: boolean;    // chime on wake word and state transitions
  language: VoiceLanguagePreference;
  speakingStyle: VoiceSpeakingStyle;
  voiceResponseEnabled: boolean;   // whether TwinMind speaks responses via TTS
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  wakeWordEnabled: false,
  autoSendDelayMs: 1800,
  voiceUri: null,
  speechRate: 1.0,
  speechPitch: 1.0,
  speechVolume: 1.0,
  continuousConversation: true,
  soundEffectsEnabled: true,
  language: "auto",
  speakingStyle: "conversational",
  voiceResponseEnabled: true,
};

