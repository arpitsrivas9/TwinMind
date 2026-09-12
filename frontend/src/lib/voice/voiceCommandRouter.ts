/**
 * TwinVoice™ — Extensible Client-Side Voice Command Router
 *
 * Directs spoken utterances to high-level OS actions:
 * navigation, stopping active audio/generation, clearing thoughts, or Gemini prompts.
 */

import { ParsedVoiceCommand, VoiceCommandIntent } from "../../types/voice";

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

  // 1. Stop / Interruption
  if (
    /^(stop|wait\s+stop|cancel|halt|pause|be\s+quiet|shut\s+up)[.!]?$/i.test(lower) ||
    lower.startsWith("stop talking") ||
    lower.startsWith("stop generating")
  ) {
    return {
      intent: "STOP_GENERATION",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.99,
    };
  }

  // 2. New thought / Reset
  if (
    /^(start\s+a\s+new\s+thought|new\s+thought|new\s+conversation|start\s+over|clear\s+chat|reset\s+chat)[.!]?$/i.test(lower) ||
    lower.startsWith("start a new conversation")
  ) {
    return {
      intent: "NEW_CONVERSATION",
      target: "chat",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }

  // 3. Repeat
  if (/^(repeat\s+that|say\s+(that\s+)?again|what\s+did\s+you\s+say|repeat)[.!]?$/i.test(lower)) {
    return {
      intent: "REPEAT",
      rawUtterance,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 4. Summarize
  if (
    /^(summarize\s+(this\s+)?conversation|summarize\s+this|give\s+me\s+a\s+summary|summarize)[.!]?$/i.test(lower) ||
    lower.startsWith("summarize what we") ||
    lower.startsWith("summarize this")
  ) {
    return {
      intent: "SUMMARIZE",
      rawUtterance,
      cleanedQuery: "Please summarize our conversation so far in concise bullet points.",
      confidence: 0.94,
    };
  }

  // 5. Navigation Intents (TwinMind OS Modules)
  const navRules: Array<{ pattern: RegExp; target: string }> = [
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(my\s+)?memory/i, target: "memory" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(my\s+)?(knowledge\s+)?graph/i, target: "graph" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(search|documents|rag)/i, target: "search" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(agents|twinagents|fleet)/i, target: "agents" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(settings|preferences|config)/i, target: "settings" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(profile|account)/i, target: "profile" },
    { pattern: /(open|go\s+to|show\s+me|switch\s+to)\s+(chat|twin\s*core|home)/i, target: "chat" },
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
