import {
  parseWavPcmSamples,
  extractAcousticFeatureVector,
  segmentSpeechUtterances,
  defaultVoiceBiometricProvider,
} from '../src/services/trust/biometricProviders';

function createWavBuffer(
  fundamentalFreq: number,
  durationSec: number,
  sampleRate = 16000,
  activeSpeechRatio = 1.0,
  phaseOffset = 0,
): Buffer {
  const numSamples = Math.floor(durationSec * sampleRate);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);

  // Subchunk 1: fmt
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // Subchunk 2: data
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  const speechSamples = Math.floor(numSamples * activeSpeechRatio);

  for (let i = 0; i < numSamples; i++) {
    if (i < speechSamples) {
      const t = (i + phaseOffset) / sampleRate;
      // Fundamental + 2 formant resonances
      const s =
        0.5 * Math.sin(2 * Math.PI * fundamentalFreq * t) +
        0.3 * Math.sin(2 * Math.PI * (fundamentalFreq * 2.3) * t) +
        0.2 * Math.sin(2 * Math.PI * (fundamentalFreq * 3.7) * t);
      buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2);
    } else {
      // Silence / background noise
      buffer.writeInt16LE(0, 44 + i * 2);
    }
  }

  return buffer;
}

function createMultiSegmentWavBuffer(
  segments: { freq: number; durationSec: number; isSpeech: boolean }[],
  sampleRate = 16000,
): Buffer {
  let totalSamples = 0;
  for (const s of segments) {
    totalSamples += Math.floor(s.durationSec * sampleRate);
  }

  const buffer = Buffer.alloc(44 + totalSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + totalSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(totalSamples * 2, 40);

  let sampleOffset = 0;
  for (const seg of segments) {
    const num = Math.floor(seg.durationSec * sampleRate);
    for (let i = 0; i < num; i++) {
      if (seg.isSpeech) {
        const t = (sampleOffset + i) / sampleRate;
        const s =
          0.5 * Math.sin(2 * Math.PI * seg.freq * t) +
          0.3 * Math.sin(2 * Math.PI * (seg.freq * 2.3) * t) +
          0.2 * Math.sin(2 * Math.PI * (seg.freq * 3.7) * t);
        buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + (sampleOffset + i) * 2);
      } else {
        buffer.writeInt16LE(0, 44 + (sampleOffset + i) * 2);
      }
    }
    sampleOffset += num;
  }

  return buffer;
}

describe('TwinVoice™ Biometric Acoustic Engine', () => {
  describe('WAV PCM Parsing', () => {
    it('should accurately parse standard 16-bit linear PCM WAV buffer', () => {
      const wav = createWavBuffer(150, 3.0, 16000);
      const parsed = parseWavPcmSamples(wav);

      expect(parsed).not.toBeNull();
      expect(parsed!.sampleRate).toBe(16000);
      expect(parsed!.channels).toBe(1);
      expect(parsed!.durationSec).toBeCloseTo(3.0, 1);
      expect(parsed!.samples.length).toBe(48000);
      expect(parsed!.samples[0]).toBeDefined();
    });

    it('should reject non-WAV buffer gracefully', () => {
      const garbage = Buffer.from('Not a valid RIFF WAVE buffer');
      const parsed = parseWavPcmSamples(garbage);
      expect(parsed).toBeNull();
    });
  });

  describe('Feature Extraction & VAD Validation', () => {
    it('should reject silent audio with dynamic range < 8', () => {
      const silentWav = createWavBuffer(0, 3.0, 16000, 0);
      const parsed = parseWavPcmSamples(silentWav)!;
      const result = extractAcousticFeatureVector(parsed.samples, parsed.sampleRate);

      expect(result.dynamicRange).toBeLessThan(8);
      expect(result.speechFrames).toBe(0);
      expect(result.speechDurationSec).toBe(0);
    });

    it('should accurately measure speech duration across active frames', () => {
      // 3.0s total, active speech for 50% (1.5s)
      const wav = createWavBuffer(140, 3.0, 16000, 0.5);
      const parsed = parseWavPcmSamples(wav)!;
      const result = extractAcousticFeatureVector(parsed.samples, parsed.sampleRate);

      expect(result.dynamicRange).toBeGreaterThan(50);
      expect(result.speechDurationSec).toBeGreaterThanOrEqual(1.2);
      expect(result.speechDurationSec).toBeLessThanOrEqual(1.7);
    });

    it('should extract 32-element zero-mean unit-length normalized acoustic vector', () => {
      const wav = createWavBuffer(140, 3.0, 16000, 1.0);
      const parsed = parseWavPcmSamples(wav)!;
      const result = extractAcousticFeatureVector(parsed.samples, parsed.sampleRate);

      expect(result.vector.length).toBe(32);
      let normSq = 0;
      for (const val of result.vector) {
        normSq += val * val;
      }
      expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 2);
    });
  });

  describe('Adaptive Multi-Segment Utterance Segmentation', () => {
    it('should accurately split audio into distinct speech segments across pauses', () => {
      const multiSegWav = createMultiSegmentWavBuffer([
        { freq: 140, durationSec: 1.5, isSpeech: true },
        { freq: 0, durationSec: 0.5, isSpeech: false }, // 500ms pause
        { freq: 140, durationSec: 1.8, isSpeech: true },
        { freq: 0, durationSec: 0.5, isSpeech: false }, // 500ms pause
        { freq: 140, durationSec: 1.6, isSpeech: true },
      ]);

      const parsed = parseWavPcmSamples(multiSegWav)!;
      const segments = segmentSpeechUtterances(parsed.samples, parsed.sampleRate);

      expect(segments.length).toBe(3);
      expect(segments[0].durationSec).toBeGreaterThanOrEqual(1.2);
      expect(segments[1].durationSec).toBeGreaterThanOrEqual(1.5);
      expect(segments[2].durationSec).toBeGreaterThanOrEqual(1.4);
      expect(segments[0].vector.length).toBe(32);
    });
  });

  describe('Adaptive Speaker Enrollment & Verification', () => {
    const userId = 'biometric_test_owner_adaptive_1';

    it('should adaptively complete enrollment in < 30s when sufficient consistent segments exist', async () => {
      // 3 natural consistent speech segments (total ~5.5s active speech, duration ~6.5s)
      const adaptiveEnrollAudio = createMultiSegmentWavBuffer([
        { freq: 145, durationSec: 1.8, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 145, durationSec: 1.8, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 145, durationSec: 1.8, isSpeech: true },
      ]);

      const result = await defaultVoiceBiometricProvider.enrollVoice(userId, adaptiveEnrollAudio);
      expect(result.enrolled).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.encryptedTemplate).toBeDefined();
      expect(result.templateHash).toBeDefined();
      expect(result.segmentsAnalyzed).toBeGreaterThanOrEqual(2);
      expect(result.speechDurationSec).toBeGreaterThanOrEqual(4.5);
    });

    it('should complete extended enrollment (> 35s) in the same session without timing out', async () => {
      // 40-second audio with long natural pauses
      const longSessionAudio = createMultiSegmentWavBuffer([
        { freq: 140, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 5.0, isSpeech: false }, // long pause
        { freq: 140, durationSec: 2.5, isSpeech: true },
        { freq: 0, durationSec: 5.0, isSpeech: false }, // long pause
        { freq: 140, durationSec: 2.5, isSpeech: true },
        { freq: 0, durationSec: 23.0, isSpeech: false }, // extended silence
      ]);

      const result = await defaultVoiceBiometricProvider.enrollVoice(userId, longSessionAudio);
      expect(result.enrolled).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.speechDurationSec).toBeGreaterThanOrEqual(5.0);
    });

    it('should REJECT mixed speakers / inconsistent voices during enrollment', async () => {
      // Segment 1 is Speaker A (140 Hz), Segment 2 is Speaker B (300 Hz)
      const mixedSpeakerAudio = createMultiSegmentWavBuffer([
        { freq: 140, durationSec: 2.2, isSpeech: true },
        { freq: 0, durationSec: 0.5, isSpeech: false },
        { freq: 300, durationSec: 2.2, isSpeech: true },
      ]);

      await expect(
        defaultVoiceBiometricProvider.enrollVoice(userId, mixedSpeakerAudio),
      ).rejects.toThrow(/Inconsistent speaker characteristics detected/);
    });

    it('should REJECT single tiny word fragments ("hello", "buddy", < 0.5s)', async () => {
      const tinyAudio = createWavBuffer(140, 0.4, 16000, 0.5);
      await expect(
        defaultVoiceBiometricProvider.enrollVoice(userId, tinyAudio),
      ).rejects.toThrow();
    });

    it('should verify matching owner voice and elevate with high confidence (>= 0.85)', async () => {
      const enrollmentAudio = createMultiSegmentWavBuffer([
        { freq: 150, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 150, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 150, durationSec: 2.0, isSpeech: true },
      ]);
      const enrollment = await defaultVoiceBiometricProvider.enrollVoice(userId, enrollmentAudio);

      // Verify with 3-second query of the SAME speaker with natural phase offset
      const queryAudio = createWavBuffer(150, 3.0, 16000, 1.0, 120);

      const verifyRes = await defaultVoiceBiometricProvider.verifyVoice(
        userId,
        queryAudio,
        enrollment.encryptedTemplate,
      );

      expect(verifyRes.verified).toBe(true);
      expect(verifyRes.voiceState).toBe('VOICE_OWNER_MATCH');
      expect(verifyRes.confidence).toBeGreaterThanOrEqual(0.85);
      expect(verifyRes.antiSpoofPassed).toBe(true);
      expect(verifyRes.replayDetected).toBe(false);
    });

    it('should REJECT different speaker (non-owner) with VOICE_NON_OWNER (< 0.75)', async () => {
      const enrollmentAudio = createMultiSegmentWavBuffer([
        { freq: 140, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 140, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 140, durationSec: 2.0, isSpeech: true },
      ]);
      const enrollment = await defaultVoiceBiometricProvider.enrollVoice(userId, enrollmentAudio);

      // Different speaker with 280 Hz fundamental frequency and distinct acoustic profile
      const differentSpeakerAudio = createWavBuffer(280, 3.0, 16000, 1.0, 0);

      const verifyRes = await defaultVoiceBiometricProvider.verifyVoice(
        userId,
        differentSpeakerAudio,
        enrollment.encryptedTemplate,
      );

      expect(verifyRes.verified).toBe(false);
      expect(verifyRes.voiceState).toBe('VOICE_NON_OWNER');
      expect(verifyRes.confidence).toBeLessThan(0.60);
    });

    it('should detect and reject replay attacks using identical query buffer', async () => {
      const enrollmentAudio = createMultiSegmentWavBuffer([
        { freq: 160, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 160, durationSec: 2.0, isSpeech: true },
        { freq: 0, durationSec: 0.4, isSpeech: false },
        { freq: 160, durationSec: 2.0, isSpeech: true },
      ]);
      const enrollment = await defaultVoiceBiometricProvider.enrollVoice(userId, enrollmentAudio);

      const queryAudio = createWavBuffer(160, 3.0, 16000, 1.0, 20);

      // First presentation succeeds
      const firstRes = await defaultVoiceBiometricProvider.verifyVoice(
        userId,
        queryAudio,
        enrollment.encryptedTemplate,
      );
      expect(firstRes.verified).toBe(true);

      // Immediate replay of the exact same audio buffer must be blocked
      const replayRes = await defaultVoiceBiometricProvider.verifyVoice(
        userId,
        queryAudio,
        enrollment.encryptedTemplate,
      );
      expect(replayRes.verified).toBe(false);
      expect(replayRes.replayDetected).toBe(true);
      expect(replayRes.voiceState).toBe('VOICE_VERIFICATION_FAILED');
    });
  });
});
