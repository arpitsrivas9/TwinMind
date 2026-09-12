/**
 * TwinVoice™ — Deterministic Voice State Machine
 *
 * Enforces valid state transitions and eliminates impossible states.
 */

import { VoiceState } from "../../types/voice";

/**
 * Transition rules map: defines all allowable next states for each state.
 */
const VALID_TRANSITIONS: Record<VoiceState, readonly VoiceState[]> = {
  IDLE: ["LISTENING", "THINKING", "ERROR"],
  LISTENING: ["TRANSCRIBING", "IDLE", "ERROR"],
  TRANSCRIBING: ["THINKING", "LISTENING", "IDLE", "ERROR"],
  THINKING: ["SPEAKING", "INTERRUPTED", "IDLE", "ERROR"],
  SPEAKING: ["INTERRUPTED", "LISTENING", "IDLE", "ERROR"],
  INTERRUPTED: ["LISTENING", "IDLE", "ERROR"],
  ERROR: ["IDLE", "LISTENING"],
};

/**
 * Validates whether a transition from `from` to `to` is legally permitted.
 */
export function canTransitionVoice(from: VoiceState, to: VoiceState): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Asserts and performs state transition, throwing or warning on invalid transition.
 */
export function transitionVoice(
  current: VoiceState,
  next: VoiceState,
  onInvalid?: (from: VoiceState, to: VoiceState) => void,
): VoiceState {
  if (canTransitionVoice(current, next)) {
    return next;
  }
  if (onInvalid) {
    onInvalid(current, next);
  } else {
    console.warn(`[TwinVoice] Rejected invalid state transition from "${current}" to "${next}"`);
  }
  return current;
}

