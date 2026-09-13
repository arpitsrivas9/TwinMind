/**
 * TwinVoice™ — Extensible Client-Side Voice Command Router
 *
 * Directs spoken utterances to high-level OS actions:
 * interruption/stop, owner verification, navigation, clearing thoughts, or Gemini prompts.
 */

import { ParsedVoiceCommand } from "../../types/voice";

const WAKE_WORD_PATTERNS = [
  /^\s*hey\s+buddy[,.?!]?\s*/i,
  /^\s*okay\s+buddy[,.?!]?\s*/i,
  /^\s*ok\s+buddy[,.?!]?\s*/i,
  /^\s*hi\s+buddy[,.?!]?\s*/i,
  /^\s*buddy[,.?!]?\s*/i,
  /^\s*hey\s+twinmind[,.?!]?\s*/i,
  /^\s*twinmind[,.?!]?\s*/i,
];

export function cleanUtterance(raw: string): string {
  let cleaned = raw.trim();
  for (const pat of WAKE_WORD_PATTERNS) {
    cleaned = cleaned.replace(pat, "").trim();
  }
  return cleaned.replace(/^please\s+/i, "").trim();
}

// Standalone stop regex pattern for English, Hindi, and Hinglish
const STOP_KEYWORDS_PATTERN =
  "(?:stop|halt|cancel|pause|wait|wait\\s+wait|hold\\s+on|one\\s+second|1\\s+second|one\\s+sec|1\\s+sec|" +
  "enough|thats\\s+enough|that\\s+is\\s+enough|be\\s+quiet|quiet|shut\\s+up|shhh?|" +
  "ruko|ruk|ruk\\s*jao|ruk\\s*ja|rukiye|thehro|thoda\\s+ruko|thoda\\s+rukna|abhi\\s+ruko|ruk\\s+zara|ruko\\s+zara|" +
  "ek\\s+minute|1\\s+minute|ek\\s+minute\\s+ruk\\s*jao|ek\\s+minute\\s+ruko|ek\\s+sec|ek\\s+second|" +
  "wait\\s+karo|stop\\s+karo|bas|bas\\s+karo|bas\\s+ab|band\\s+karo|chup|chup\\s+raho|chup\\s+ho\\s*jao|chup\\s+kar|" +
  "bolna\\s+band\\s+karo|बस|बस\\s+करो|चुप|एक\\s+मिनट|ठहरो|रुकिए|अभी\\s+रुको|रुको|रुक\\s+जाओ|रुक)";

const EXACT_STOP_REGEX = new RegExp(`^${STOP_KEYWORDS_PATTERN}$`, "i");

const PREFIX_STOP_REGEX = new RegExp(
  `^(?:stop\\s+talking|stop\\s+generating|stop\\s+it|stop\\s+now|wait\\s+a\\s+minute|wait\\s+a\\s+sec|wait\\s+a\\s+second|` +
  `ruko\\s+zara|ruk\\s+jao\\s+zara|ruko\\s+suno|bas\\s+karo\\s+ab|bolna\\s+band\\s+karo|please\\s+stop)`,
  "i",
);

const TAIL_STOP_REGEX = new RegExp(
  `(?:^|\\s)${STOP_KEYWORDS_PATTERN}(?:\\s+(?:buddy|twinmind|please|now|zara|ab))?$`,
  "i",
);

/**
 * Determines whether an utterance represents an interruption, stop, or pause intent
 * across English, Hindi (Devanagari & Roman), and Hinglish.
 */
export function isInterruptionIntent(raw: string): boolean {
  if (!raw) return false;
  const clean = raw.trim().toLowerCase().replace(/[.,!?;:]/g, "");
  if (!clean) return false;

  // Strip conversational address ("buddy", "twinmind", "hey buddy", "please")
  const normalized = clean
    .replace(/\b(?:hey|okay|ok|hi)?\s*(?:buddy|twinmind)\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .trim();

  // 1. Direct standalone stop command
  if (EXACT_STOP_REGEX.test(normalized) || EXACT_STOP_REGEX.test(clean)) {
    return true;
  }

  // 2. Starts with command phrasing
  if (PREFIX_STOP_REGEX.test(normalized) || PREFIX_STOP_REGEX.test(clean)) {
    return true;
  }

  // 3. Utterance ends with an interruption keyword (handles leading ambient words or speaker echo)
  if (TAIL_STOP_REGEX.test(normalized) || TAIL_STOP_REGEX.test(clean)) {
    return true;
  }

  // 4. Token-window check: if the last 1 to 4 words constitute an interruption command
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    for (let len = 1; len <= Math.min(4, words.length); len++) {
      const window = words.slice(-len).join(" ");
      const winNorm = window.replace(/\b(?:buddy|twinmind|please|now|zara|ab)\b/gi, "").trim();
      if (EXACT_STOP_REGEX.test(winNorm) || EXACT_STOP_REGEX.test(window)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns true if the utterance is solely an interruption/stop command
 * without any subsequent question or instruction.
 */
export function isStopOnlyIntent(raw: string): boolean {
  if (!isInterruptionIntent(raw)) return false;

  const cleaned = cleanUtterance(raw).toLowerCase().replace(/[.,!?;:]/g, "");
  const normalized = cleaned
    .replace(/\b(?:hey|okay|ok|hi)?\s*(?:buddy|twinmind)\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .trim();

  if (EXACT_STOP_REGEX.test(normalized) || EXACT_STOP_REGEX.test(cleaned)) {
    return true;
  }

  // If after removing known stop phrases, virtually nothing remains, it is stop-only
  const remaining = normalized
    .replace(new RegExp(STOP_KEYWORDS_PATTERN, "gi"), "")
    .replace(/\b(?:now|zara|ab|suno|bhai|yaar)\b/gi, "")
    .trim();

  return remaining.length === 0;
}

/**
 * Determines whether the user is requesting Owner Verification or switching to Owner Mode.
 */
export function isOwnerVerificationIntent(raw: string): boolean {
  if (!raw) return false;
  const clean = cleanUtterance(raw).toLowerCase().replace(/[.,!?;:]/g, "");
  if (!clean) return false;

  // 1. English patterns
  const englishPatterns = [
    /\b(?:verify|authenticate)\s+(?:me\s+)?(?:as\s+)?(?:the\s+)?owner\b/i,
    /\b(?:verify|authenticate)\s+my\s+identity\b/i,
    /\b(?:switch|change|transition|go)\s+to\s+owner\s+mode\b/i,
    /\b(?:switch|change|transition|go)\s+to\s+owner\b/i,
    /\b(?:unlock|enable|activate|enter)\s+owner\s+mode\b/i,
    /\b(?:unlock|enable|activate|enter)\s+owner\b/i,
    /\b(?:take\s+me\s+to\s+)?owner\s+verification\b/i,
    /\b(?:i\s+am\s+(?:the\s+)?owner|make\s+me\s+owner)\b/i,
    /\b(?:start|begin|run|do)\s+owner\s+verification\b/i,
    /\bverify\s+me\b/i,
    /\bverify\s+owner\b/i,
  ];

  for (const pattern of englishPatterns) {
    if (pattern.test(clean)) return true;
  }

  // 2. Hindi and Hinglish patterns
  const hindiPatterns = [
    /\bowner\s+verification\b/i,
    /\bowner\s+verify\s*(?:karo|karein|kar\s*do)?\b/i,
    /\bmujhe\s+owner\s+verify\s*karo\b/i,
    /\bidentity\s+verify\s*karo\b/i,
    /\bowner\s+mode\s*(?:switch|unlock|chalu|kholo|lagao|on\s+karo|activate\s+karo)\b/i,
    /\bowner\s+mode\s+me\s*(?:switch|jao|karo)\b/i,
    /\bowner\s+verification\s*(?:kholo|shuru\s+karo|start\s+karo)\b/i,
    /\bowner\s+banao\b/i,
  ];

  for (const pattern of hindiPatterns) {
    if (pattern.test(clean)) return true;
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

  // 1. Stop / Interruption (English, Hindi, Hinglish) - Highest Priority
  if (isInterruptionIntent(rawUtterance) || isInterruptionIntent(cleaned)) {
    return {
      intent: "STOP_GENERATION",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.99,
    };
  }

  // 2. Owner Verification (English, Hindi, Hinglish)
  if (isOwnerVerificationIntent(rawUtterance) || isOwnerVerificationIntent(cleaned)) {
    return {
      intent: "VERIFY_OWNER",
      target: "trust",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }

  // 3. New thought / Reset (English, Hindi, Hinglish)
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

  // 4. Repeat (English, Hindi, Hinglish)
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

  // 5. Summarize (English, Hindi, Hinglish)
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

  // 6. Navigation Intents (TwinMind OS Modules - English, Hindi, Hinglish)
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

  // 7. Multi-Agent Dispatch Extension
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

  // 8. General Conversational Query -> Handled by Gemini Twin Core
  return {
    intent: "CHAT_QUERY",
    rawUtterance,
    cleanedQuery: cleaned || rawUtterance,
    confidence: 0.85,
  };
}
