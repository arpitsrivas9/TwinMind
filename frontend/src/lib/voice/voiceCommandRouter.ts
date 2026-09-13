/**
 * TwinVoice™ — Extensible Client-Side Voice Command Router
 *
 * Directs spoken utterances to high-level OS actions:
 * navigation, stopping active audio/generation, clearing thoughts, or Gemini prompts.
 */

import { ParsedVoiceCommand } from "../../types/voice";

const WAKE_WORD_PATTERNS = [
  /^\s*hey\s+buddy[,.?!]?\s*/i,
  /^\s*okay\s+buddy[,.?!]?\s*/i,
  /^\s*ok\s+buddy[,.?!]?\s*/i,
  /^\s*hi\s+buddy[,.?!]?\s*/i,
  /^\s*buddy[,.?!]?\s*/i,
];

export function cleanUtterance(raw: string): string {
  let cleaned = raw.trim();
  for (const pat of WAKE_WORD_PATTERNS) {
    cleaned = cleaned.replace(pat, "").trim();
  }
  return cleaned.replace(/^please\s+/i, "").trim();
}

/**
 * Determines whether an utterance represents an interruption, stop, or pause intent
 * across English, Hindi (Devanagari & Roman), and Hinglish.
 */
export function isInterruptionIntent(raw: string): boolean {
  if (!raw) return false;
  const clean = raw.trim().toLowerCase().replace(/[.,!?;:]/g, "");
  if (!clean) return false;

  // Strip trailing or leading conversational address ("buddy", "hey buddy", "please")
  const normalized = clean
    .replace(/\b(?:hey|okay|ok|hi)?\s*buddy\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .trim();

  // 1. Direct standalone stop / interrupt commands (English, Hindi Devanagari, Roman Hinglish)
  const exactStopRegex =
    /^(stop|halt|cancel|pause|wait|wait\s+wait|hold\s+on|one\s+second|1\s+second|one\s+sec|1\s+sec|enough|thats\s+enough|that\s+is\s+enough|be\s+quiet|shut\s+up|shh+|ruko|ruk|ruk\s*jao|rukiye|thehro|thoda\s+ruko|abhi\s+ruko|ruk\s+zara|ek\s+minute|1\s+minute|ek\s+minute\s+ruk\s*jao|ek\s+sec|ek\s+second|wait\s+karo|stop\s+karo|bas|bas\s+karo|bas\s+ab|band\s+karo|chup|chup\s+raho|chup\s+ho\s*jao|chup\s+kar|bolna\s+band\s+karo|बस|बस\s+करो|चुप|एक\s+मिनट|ठहरो|रुकिए|अभी\s+रुको|रुको|रुक\s+जाओ|रुक)$/i;

  if (exactStopRegex.test(normalized) || exactStopRegex.test(clean)) {
    return true;
  }

  // 2. Starts with command phrasing (e.g. "stop talking", "stop generating", "wait a minute", "please stop talking")
  if (
    /^(stop\s+talking|stop\s+generating|stop\s+it|stop\s+now|wait\s+a\s+minute|wait\s+a\s+sec|wait\s+a\s+second|ruko\s+zara|ruk\s+jao\s+zara|ruko\s+suno|bas\s+karo\s+ab|bolna\s+band\s+karo)/i.test(
      normalized,
    ) ||
    /^(stop\s+talking|stop\s+generating|stop\s+it|stop\s+now|wait\s+a\s+minute|wait\s+a\s+sec|wait\s+a\s+second|ruko\s+zara|ruk\s+jao\s+zara|ruko\s+suno|bas\s+karo\s+ab|bolna\s+band\s+karo)/i.test(
      clean,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether an incoming microphone transcript is simply an acoustic echo
 * of what TwinMind's text-to-speech engine is currently speaking aloud.
 */
export function isAcousticEcho(transcript: string, currentSpokenText: string): boolean {
  if (!transcript || !currentSpokenText) return false;
  const tNorm = transcript.trim().toLowerCase().replace(/[^\w\s]/g, "");
  const sNorm = currentSpokenText.trim().toLowerCase().replace(/[^\w\s]/g, "");
  if (!tNorm || !sNorm) return false;

  // Never treat explicit stop commands as acoustic echo
  if (isInterruptionIntent(transcript)) return false;

  // If transcript is contained within what TwinMind is currently speaking, it is speaker echo
  if (sNorm.includes(tNorm)) {
    return true;
  }

  // Check word overlap: if 3+ consecutive words match spoken text
  const tWords = tNorm.split(/\s+/).filter(Boolean);
  if (tWords.length >= 3 && sNorm.includes(tWords.slice(0, 3).join(" "))) {
    return true;
  }

  return false;
}

/**
 * Routes spoken utterance to structured intent and execution target.
 */
export function routeVoiceCommand(rawUtterance: string): ParsedVoiceCommand {
  const cleaned = cleanUtterance(rawUtterance);
  const lower = cleaned.toLowerCase();

  // 1. Stop / Interruption (English, Hindi, Hinglish)
  if (isInterruptionIntent(rawUtterance) || isInterruptionIntent(cleaned)) {
    return {
      intent: "STOP_GENERATION",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.99,
    };
  }

  // 2. New thought / Reset (English, Hindi, Hinglish)
  if (
    /^(start\s+a\s+new\s+thought|new\s+thought|new\s+conversation|start\s+over|clear\s+chat|reset\s+chat|naya\s+thought|naya\s+conversation|naya\s+chat|naye\s+sire\s+se\s+shuru\s+karo)[.!]?$/i.test(lower) ||
    lower.startsWith("start a new conversation") ||
    lower.startsWith("naya thought shuru") ||
    lower.startsWith("new thought start") ||
    lower.startsWith("chat clear karo")
  ) {
    return {
      intent: "NEW_CONVERSATION",
      target: "chat",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }

  // 3. Repeat (English, Hindi, Hinglish)
  if (
    /^(repeat\s+that|say\s+(that\s+)?again|what\s+did\s+you\s+say|repeat|phir\s+se\s+bolo|dobara\s+bolo|repeat\s+karo|kya\s+bola\s+tha|wapas\s+bolo)[.!]?$/i.test(lower)
  ) {
    return {
      intent: "REPEAT",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 4. Summarize (English, Hindi, Hinglish)
  if (
    /^(summarize\s+(this\s+)?conversation|summarize\s+this|give\s+me\s+a\s+summary|summarize|summary\s+batao|isko\s+summarize\s+karo|sankshep\s+mein\s+batao)[.!]?$/i.test(lower) ||
    lower.startsWith("summarize what we") ||
    lower.startsWith("summarize this") ||
    lower.startsWith("summary do") ||
    lower.startsWith("summary batao")
  ) {
    return {
      intent: "SUMMARIZE",
      rawUtterance,
      cleanedQuery: "Please summarize our conversation so far in concise bullet points.",
      confidence: 0.94,
    };
  }

  // 5. Navigation Intents (TwinMind OS Modules - English, Hindi, Hinglish)
  const navRules: Array<{ pattern: RegExp; target: string }> = [
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(my\s+)?memory/i, target: "memory" },
    { pattern: /memory\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "memory" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(my\s+)?(knowledge\s+)?graph/i, target: "graph" },
    { pattern: /(knowledge\s+)?graph\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "graph" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(search|documents|rag)/i, target: "search" },
    { pattern: /(documents|search)\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "search" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(agents|twinagents|fleet)/i, target: "agents" },
    { pattern: /agents\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "agents" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(settings|preferences|config)/i, target: "settings" },
    { pattern: /settings\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "settings" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(profile|account)/i, target: "profile" },
    { pattern: /profile\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "profile" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to|kholo|dikhao)\s+(chat|twin\s*core|home)/i, target: "chat" },
    { pattern: /chat\s+(kholo|open\s+karo|dikhao|par\s+jao)/i, target: "chat" },
  ];

  for (const { pattern, target } of navRules) {
    if (pattern.test(lower)) {
      return {
        intent: "NAVIGATE",
        target,
        rawUtterance,
        cleanedQuery: cleaned,
        confidence: 0.95,
      };
    }
  }

  // 6. Multi-Agent Dispatch Extension
  const agentMatch = lower.match(/(?:ask|tell|assign|dispatch)\s+(?:the\s+)?(coding|research|productivity|study)\s+agent\s+to\s+(.+)/i);
  if (agentMatch) {
    return {
      intent: "AGENT_DISPATCH",
      target: agentMatch[1].toLowerCase(),
      rawUtterance,
      cleanedQuery: agentMatch[2].trim(),
      confidence: 0.88,
    };
  }

  // 7. General Conversational Query -> Handled by Gemini Twin Core
  return {
    intent: "CHAT_QUERY",
    rawUtterance,
    cleanedQuery: cleaned || rawUtterance,
    confidence: 0.85,
  };
}
