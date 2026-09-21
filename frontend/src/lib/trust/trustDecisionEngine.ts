import { CameraEvidenceState, VoiceEvidenceState, TrustMode } from '../../types/trust';

export interface DecisionResult {
  targetMode: TrustMode;
  reason: string;
  shouldTransition: boolean;
}

/**
 * Authoritative TwinTrust™ Multimodal Decision Matrix.
 * Continuously decides the appropriate TrustMode (OWNER, GUEST, LOCKED)
 * by evaluating independent Camera (visual) and Voice (acoustic) biometric evidence.
 *
 * Core Principles:
 * 1. FACE PRESENCE NEVER OVERRIDES ACTIVE NON-OWNER SPEAKER (Case B):
 *    If a non-owner speaks while Owner's face is visible, switch to GUEST.
 * 2. OWNER VOICE ALONE CAN GRANT/MAINTAIN OWNER (Case C):
 *    Camera absence alone does not force Guest.
 * 3. SILENCE IS NOT A LOGOUT (Case E):
 *    No camera + silence maintains the current authenticated state.
 * 4. TEMPORARY CAMERA OCCLUSION IS NOT AN INTRUDER:
 *    Maintain current state on temporary visual loss.
 * 5. UNKNOWN != NON_OWNER (Case F):
 *    One weak/ambiguous voice sample does not revoke Owner mode from a verified face.
 * 6. OWNER RETURN (Case G):
 *    Verified owner voice or verified owner face transitions GUEST -> OWNER seamlessly.
 */
export function evaluateTwinTrustDecision(
  currentMode: TrustMode,
  camera: CameraEvidenceState,
  voice: VoiceEvidenceState,
): DecisionResult {
  // If the system is currently locked, only explicit authentication unlocks it
  if (currentMode === 'LOCKED') {
    return {
      targetMode: 'LOCKED',
      reason: 'System is locked. Explicit verification required to unlock.',
      shouldTransition: false,
    };
  }

  // -------------------------------------------------------------
  // RULE 1: Confident NON-OWNER Voice is decisively demoting (Case B, D)
  // -------------------------------------------------------------
  // Face presence MUST NOT override a confident non-owner speaker result.
  // The person speaking is the person actively commanding TwinMind.
  if (voice === 'NON_OWNER_VOICE') {
    const shouldTransition = currentMode !== 'GUEST';
    return {
      targetMode: 'GUEST',
      reason:
        camera === 'OWNER_FACE'
          ? 'Non-owner speaker detected while owner is visible. Active speaker takes precedence over visual presence.'
          : 'Non-owner speaker verified. Switching to Guest Mode to protect owner privacy.',
      shouldTransition,
    };
  }

  // -------------------------------------------------------------
  // RULE 2: Confident OWNER Voice grants/restores OWNER (Case A, C, G)
  // -------------------------------------------------------------
  // Verified owner voice is valid whether in front of camera, away from camera, or camera unavailable.
  if (voice === 'OWNER_VOICE') {
    const shouldTransition = currentMode !== 'OWNER';
    return {
      targetMode: 'OWNER',
      reason:
        currentMode === 'GUEST'
          ? 'Owner voice verified. Restoring Owner Mode with full privileges.'
          : 'Owner voice verified acoustic match.',
      shouldTransition,
    };
  }

  // -------------------------------------------------------------
  // RULE 3: Owner Face is present with No Speech or Unknown Voice (Case A, F)
  // -------------------------------------------------------------
  if (camera === 'OWNER_FACE') {
    if (currentMode === 'GUEST') {
      // Owner returned and is visually verified
      return {
        targetMode: 'OWNER',
        reason: 'Owner face visually verified. Restoring Owner Mode.',
        shouldTransition: true,
      };
    }

    if (voice === 'UNKNOWN_VOICE') {
      // Case F: Ambiguous voice window does NOT revoke Owner mode when Owner face is verified
      return {
        targetMode: 'OWNER',
        reason: 'Owner face confirmed; ambiguous voice sample did not revoke Owner state.',
        shouldTransition: false,
      };
    }

    // Silence while sitting in front of laptop (Case A)
    return {
      targetMode: 'OWNER',
      reason: 'Owner face actively present in camera frame.',
      shouldTransition: false,
    };
  }

  // -------------------------------------------------------------
  // RULE 4: Sustained UNKNOWN_FACE (intruder in front of camera without owner voice)
  // -------------------------------------------------------------
  if (camera === 'UNKNOWN_FACE') {
    const shouldTransition = currentMode !== 'GUEST';
    return {
      targetMode: 'GUEST',
      reason: 'Persistent unverified face detected in front of screen.',
      shouldTransition,
    };
  }

  // -------------------------------------------------------------
  // RULE 5: No Camera / Camera Unavailable + Silence / Inconclusive (Case E, 11, 18)
  // -------------------------------------------------------------
  // Silence is NOT evidence of a different person.
  // Camera absence is NOT a logout.
  // Maintain existing authenticated Owner or Guest state.
  return {
    targetMode: currentMode,
    reason: `Preserving current ${currentMode} state (camera: ${camera}, voice: ${voice}).`,
    shouldTransition: false,
  };
}
