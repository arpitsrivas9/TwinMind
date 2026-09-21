import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { extractAcousticFeatureVector } from '../services/trust/biometricProviders';

const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_twinmind_super_secure_key_2026';

function unpackBiometricVector(buf: Buffer): number[] {
  const len = Math.floor(buf.length / 2);
  const vector = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    vector[i] = Number((buf.readInt16LE(i * 2) / 32767).toFixed(6));
  }
  return vector;
}

function decryptBiometricTemplate(payload: string, secret: string): number[] | null {
  try {
    const parts = payload.split(':');
    if (parts.length === 4 && parts[0] === 'v2') {
      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const ciphertext = Buffer.from(parts[3], 'base64url');
      const key = crypto.createHash('sha256').update(secret).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return unpackBiometricVector(decrypted);
    }
    return null;
  } catch {
    return null;
  }
}

// Generate natural multi-syllable sentence speech with pitch track and formants
function generateSentenceSpeech(
  f0Base: number,
  formantTrajectory: [number, number, number][],
  sampleRate = 16000,
  durationSec = 2.0
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);
  const numPhonemes = formantTrajectory.length;
  const phonemeLen = numSamples / numPhonemes;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phraseProg = i / numSamples;
    const intonation = 1.0 + 0.12 * Math.sin(Math.PI * phraseProg);
    const f0 = f0Base * intonation;

    const pIdx = Math.min(numPhonemes - 1, Math.floor(i / phonemeLen));
    const [f1, f2, f3] = formantTrajectory[pIdx];

    const T0 = 1 / f0;
    const pos = (t % T0) / T0;
    let glottal = 0;
    if (pos < 0.4) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * pos / 0.4));
    } else if (pos < 0.56) {
      glottal = Math.cos(Math.PI * (pos - 0.4) / 0.32);
    }

    const r1 = Math.sin(2 * Math.PI * f1 * t) * Math.exp(-pos * 8);
    const r2 = 0.5 * Math.sin(2 * Math.PI * f2 * t) * Math.exp(-pos * 10);
    const r3 = 0.25 * Math.sin(2 * Math.PI * f3 * t) * Math.exp(-pos * 12);

    const speech = glottal * (r1 + r2 + r3);
    const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    samples[i] = speech * envelope * 0.4;
  }
  return samples;
}

function computeGroupCenteredCosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < a.length; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= a.length;
  meanB /= b.length;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    dot += da * db;
    normA += da * da;
    normB += db * db;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Accurate Fundamental Frequency (F0) estimation via Normalized Autocorrelation
function getAccuratePitchF0(samples: Float32Array, sampleRate: number): { f0: number; confidence: number } {
  const frameSize = Math.min(1024, samples.length);
  const hopSize = Math.floor(frameSize / 2);
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const minPitch = 70;  // Hz
  const maxPitch = 380; // Hz
  const minLag = Math.floor(sampleRate / maxPitch);
  const maxLag = Math.floor(sampleRate / minPitch);

  const framePitches: number[] = [];
  const frameCorrs: number[] = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      sumSq += samples[start + i] * samples[start + i];
    }
    const rms = Math.sqrt(sumSq / frameSize);
    if (rms < 0.012) continue;

    const r = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0, d1 = 0, d2 = 0;
      for (let i = 0; i < frameSize - lag; i++) {
        const s1 = samples[start + i];
        const s2 = samples[start + i + lag];
        num += s1 * s2;
        d1 += s1 * s1;
        d2 += s2 * s2;
      }
      const d = Math.sqrt(d1 * d2);
      r[lag] = d > 1e-6 ? num / d : 0;
    }

    let selectedLag = -1;
    let peakVal = 0.4;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (r[lag] > r[lag - 1] && r[lag] > r[lag + 1] && r[lag] > peakVal) {
        selectedLag = lag;
        peakVal = r[lag];
        break;
      }
    }

    if (selectedLag === -1) {
      let maxVal = 0.45;
      for (let lag = minLag; lag <= maxLag; lag++) {
        if (r[lag] > maxVal) {
          maxVal = r[lag];
          selectedLag = lag;
        }
      }
    }

    if (selectedLag > 0) {
      framePitches.push(sampleRate / selectedLag);
      frameCorrs.push(peakVal);
    }
  }

  if (framePitches.length === 0) return { f0: 0, confidence: 0 };
  framePitches.sort((a, b) => a - b);
  const medianF0 = framePitches[Math.floor(framePitches.length / 2)];
  const avgCorr = frameCorrs.reduce((a, b) => a + b, 0) / frameCorrs.length;
  return { f0: medianF0, confidence: avgCorr };
}

// Inferred Owner Pitch from Enrolled Template
function getOwnerPitchProfile(enrolledTemplate: number[], sampleRate = 16000): { expectedF0: number; f0Min: number; f0Max: number } {
  const numPitchLags = 8;
  const minLag = Math.max(2, Math.round(sampleRate / 350));
  const maxLag = Math.min(512 - 2, Math.round(sampleRate / 75));
  const pitchLags: number[] = [];
  for (let p = 0; p < numPitchLags; p++) {
    pitchLags.push(Math.round(minLag + (maxLag - minLag) * (p / (numPitchLags - 1))));
  }

  let peakIdx = 0;
  let peakVal = -Infinity;
  for (let p = 0; p < numPitchLags; p++) {
    const val = enrolledTemplate[16 + p];
    if (val > peakVal) {
      peakVal = val;
      peakIdx = p;
    }
  }

  const expectedF0 = sampleRate / pitchLags[peakIdx];
  // Allow normal human conversational pitch variation (+- 28%)
  const f0Min = expectedF0 * 0.72;
  const f0Max = expectedF0 * 1.35;
  return { expectedF0, f0Min, f0Max };
}

// Composite Acoustic Speaker Verification Function
function verifySpeakerAcoustics(
  enrolledTemplate: number[],
  samples: Float32Array,
  sampleRate: number,
  queryVector: number[]
): { isOwnerMatch: boolean; confidence: number; details: string; score: number } {
  const formantsSim = computeGroupCenteredCosine(enrolledTemplate.slice(0, 16), queryVector.slice(0, 16));
  const pitchBinsSim = computeGroupCenteredCosine(enrolledTemplate.slice(16, 24), queryVector.slice(16, 24));
  const spectralSim = computeGroupCenteredCosine(enrolledTemplate.slice(24, 27), queryVector.slice(24, 27));

  const pitchResult = getAccuratePitchF0(samples, sampleRate);
  const ownerPitch = getOwnerPitchProfile(enrolledTemplate, sampleRate);

  // 1. Pitch physical incompatibility check
  let pitchPenalty = 1.0;
  let pitchMismatchReason = '';
  if (pitchResult.f0 > 0 && pitchResult.confidence > 0.45) {
    const isOutsidePitch = pitchResult.f0 < ownerPitch.f0Min || pitchResult.f0 > ownerPitch.f0Max;
    if (isOutsidePitch) {
      const pitchDiff = Math.abs(pitchResult.f0 - ownerPitch.expectedF0) / ownerPitch.expectedF0;
      // Exponential penalty for vocal pitch incompatibility
      pitchPenalty = Math.max(0, Math.exp(-pitchDiff * 4.0));
      pitchMismatchReason = `Pitch mismatch: observed ${pitchResult.f0.toFixed(0)} Hz vs expected ${ownerPitch.expectedF0.toFixed(0)} Hz (${(pitchDiff * 100).toFixed(0)}% delta).`;
    }
  }

  // 2. Pitch bins correlation check:
  // If pitchBinsSim is negative (anti-correlated harmonic profile), apply penalty
  let pitchBinPenalty = 1.0;
  if (pitchBinsSim < -0.15) {
    pitchBinPenalty = Math.max(0.2, 1.0 + pitchBinsSim); // drops to 0.47 for -0.53
  }

  // 3. Composite score:
  // Formants (weight 0.60) + Pitch Bins (weight 0.25) + Spectral (weight 0.15)
  const baseScore = Math.max(0, formantsSim) * 0.60 + Math.max(0, pitchBinsSim + 0.3) * 0.25 + Math.max(0, spectralSim) * 0.15;
  const finalScore = baseScore * pitchPenalty * pitchBinPenalty;

  // Decision threshold
  const THRESHOLD = 0.65;
  const isOwnerMatch = finalScore >= THRESHOLD && pitchPenalty > 0.4;

  return {
    isOwnerMatch,
    confidence: Number(finalScore.toFixed(3)),
    score: finalScore,
    details: isOwnerMatch
      ? `Owner acoustic profile matched (score: ${finalScore.toFixed(3)}, formants: ${formantsSim.toFixed(3)}).`
      : `Non-owner acoustic characteristics detected (score: ${finalScore.toFixed(3)} < ${THRESHOLD}). ${pitchMismatchReason}`,
  };
}

async function run() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });
  const enrolled = decryptBiometricTemplate(profile!.voiceVoiceprintHash!, jwtSecret)!;

  const arpitVowels: [number, number, number][] = [
    [700, 1220, 2550], [310, 2250, 2900], [360, 850, 2450], [500, 950, 2500],
  ];
  const arpitSpeech1 = generateSentenceSpeech(118, arpitVowels);
  const arpitSpeech2 = generateSentenceSpeech(115, arpitVowels);

  const motherVowels: [number, number, number][] = [
    [850, 1450, 3050], [380, 2650, 3450], [430, 1020, 2950], [600, 1150, 3000],
  ];
  const motherSpeech1 = generateSentenceSpeech(215, motherVowels);
  const motherSpeech2 = generateSentenceSpeech(225, motherVowels);

  const otherMaleVowels: [number, number, number][] = [
    [620, 1100, 2350], [280, 2050, 2700], [320, 780, 2300], [460, 880, 2350],
  ];
  const otherMaleSpeech = generateSentenceSpeech(95, otherMaleVowels);

  const testCases = [
    { name: 'Arpit Utterance 1 (Owner)', audio: arpitSpeech1, expected: 'OWNER' },
    { name: 'Arpit Utterance 2 (Owner)', audio: arpitSpeech2, expected: 'OWNER' },
    { name: 'Mother Utterance 1 (Mother)', audio: motherSpeech1, expected: 'GUEST' },
    { name: 'Mother Utterance 2 (Mother)', audio: motherSpeech2, expected: 'GUEST' },
    { name: 'Other Male (Different Male)', audio: otherMaleSpeech, expected: 'GUEST' },
  ];

  for (const tc of testCases) {
    const ext = extractAcousticFeatureVector(tc.audio, 16000);
    const result = verifySpeakerAcoustics(enrolled, tc.audio, 16000, ext.vector);

    const actual = result.isOwnerMatch ? 'OWNER' : 'GUEST';
    const status = actual === tc.expected ? 'PASS [OK]' : 'FAIL [ERROR]';
    console.log(`\n${status} ${tc.name}`);
    console.log(`  Expected: ${tc.expected}, Actual: ${actual}`);
    console.log(`  ${result.details}`);
  }
}

run().finally(() => prisma.$disconnect());

