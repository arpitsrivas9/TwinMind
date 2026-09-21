import { evaluateTwinTrustDecision } from '../src/services/trust/trustDecisionEngine';

describe('TwinTrust™ Multimodal Decision Matrix (Section 17 & 21)', () => {
  describe('Case A — Owner visible in camera + Owner voice', () => {
    it('should maintain/grant OWNER mode', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'OWNER_FACE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false); // Already OWNER
    });
  });

  describe('Case B — Owner visible in camera BUT someone else speaks (Active Speaker Precedence)', () => {
    it('MUST switch to GUEST even though Owner face is visible', () => {
      // Critical security requirement: Face presence must NOT override confident non-owner speaker!
      const result = evaluateTwinTrustDecision('OWNER', 'OWNER_FACE', 'NON_OWNER_VOICE');
      expect(result.targetMode).toBe('GUEST');
      expect(result.shouldTransition).toBe(true);
      expect(result.reason).toContain('Active speaker takes precedence');
    });
  });

  describe('Case C — Owner not in camera range BUT Owner voice verified', () => {
    it('should maintain OWNER mode when camera has NO_FACE', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'NO_FACE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false);
    });

    it('should maintain OWNER mode when CAMERA_UNAVAILABLE', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'CAMERA_UNAVAILABLE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false);
    });
  });

  describe('Case D — Owner not in camera range + Non-Owner voice', () => {
    it('should switch to GUEST mode when camera is NO_FACE', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'NO_FACE', 'NON_OWNER_VOICE');
      expect(result.targetMode).toBe('GUEST');
      expect(result.shouldTransition).toBe(true);
    });

    it('should switch to GUEST mode when CAMERA_UNAVAILABLE', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'CAMERA_UNAVAILABLE', 'NON_OWNER_VOICE');
      expect(result.targetMode).toBe('GUEST');
      expect(result.shouldTransition).toBe(true);
    });
  });

  describe('Case E — Owner not in camera range + Silence / No speech', () => {
    it('MUST NOT switch to Guest merely because camera disappeared or silence occurred', () => {
      // Silence is NOT evidence of a different person!
      const result = evaluateTwinTrustDecision('OWNER', 'NO_FACE', 'NO_SPEECH');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false);
    });

    it('MUST NOT switch to Guest when CAMERA_UNAVAILABLE and NO_SPEECH', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'CAMERA_UNAVAILABLE', 'NO_SPEECH');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false);
    });
  });

  describe('Case F — Owner face present + Unknown/Inconclusive voice', () => {
    it('MUST NOT immediately revoke Owner mode on an ambiguous voice sample', () => {
      // UNKNOWN != NON_OWNER
      const result = evaluateTwinTrustDecision('OWNER', 'OWNER_FACE', 'UNKNOWN_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false);
    });
  });

  describe('Case G — Owner returns after Guest Mode', () => {
    it('should transition GUEST -> OWNER when Owner voice is verified', () => {
      const result = evaluateTwinTrustDecision('GUEST', 'NO_FACE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(true);
    });

    it('should transition GUEST -> OWNER when Owner face is visually verified', () => {
      const result = evaluateTwinTrustDecision('GUEST', 'OWNER_FACE', 'NO_SPEECH');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(true);
    });

    it('should transition GUEST -> OWNER when both face and voice match', () => {
      const result = evaluateTwinTrustDecision('GUEST', 'OWNER_FACE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(true);
    });
  });

  describe('Intruder Face without Owner Voice', () => {
    it('should demote to GUEST when an unverified/intruder face is detected without owner speech', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'UNKNOWN_FACE', 'NO_SPEECH');
      expect(result.targetMode).toBe('GUEST');
      expect(result.shouldTransition).toBe(true);
    });

    it('should allow Owner voice to take precedence even if an unknown face is near camera', () => {
      const result = evaluateTwinTrustDecision('OWNER', 'UNKNOWN_FACE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('OWNER');
      expect(result.shouldTransition).toBe(false);
    });
  });

  describe('System Locked state', () => {
    it('should never automatically unlock from biometric presence alone without explicit authentication', () => {
      const result = evaluateTwinTrustDecision('LOCKED', 'OWNER_FACE', 'OWNER_VOICE');
      expect(result.targetMode).toBe('LOCKED');
      expect(result.shouldTransition).toBe(false);
    });
  });
});

