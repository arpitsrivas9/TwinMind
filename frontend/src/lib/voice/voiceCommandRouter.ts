/**
 * TwinVoice™ — Extensible Client-Side Voice Command Router
 *
 * Directs spoken utterances to high-level OS actions:
 * navigation, stopping active audio/generation, clearing thoughts, or Gemini prompts.
 */

import { ParsedVoiceCommand } from "../../types/voice";

const WAKE_WORD_PATTERNS = [
  /^\s*hey\s+twin\s*mind[,.?!]?\s*/i,
  /^\s*okay\s+twin\s*mind[,.?!]?\s*/i,
  /^\s*ok\s+twin\s*mind[,.?!]?\s*/i,
  /^\s*twin\s*mind[,.?!]?\s*/i,
  /^\s*hi\s+twin\s*mind[,.?!]?\s*/i,
];

export function cleanUtterance(raw: string): string {
  let cleaned = raw.trim();
  for (const pat of WAKE_WORD_PATTERNS) {
    cleaned = cleaned.replace(pat, "").trim();
  }
  return cleaned.replace(/^please\s+/i, "").trim();
}

/**
 * Routes spoken utterance to structured intent and execution target.
 */
export function routeVoiceCommand(rawUtterance: string): ParsedVoiceCommand {
  const cleaned = cleanUtterance(rawUtterance);
  const lower = cleaned.toLowerCase();

  // 1. Stop / Interruption (English, Hindi, Hinglish)
  if (
    /^(stop|wait\s+stop|cancel|halt|pause|be\s+quiet|shut\s+up|ruko|ruk\s*jao|band\s*karo|chup\s*ho\s*jao|cancel\s*kar\s*do|stop\s*karo|bas\s*karo)[.!]?$/i.test(lower) ||
    lower.startsWith("stop talking") ||
    lower.startsWith("stop generating") ||
    lower.startsWith("ruk jao") ||
    lower.startsWith("bolna band karo")
  ) {
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
