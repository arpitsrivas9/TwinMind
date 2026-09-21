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

// Group-wise normalized cosine similarity:
// Subtract each group's OWN mean before dot product, so negative constants don't spuriously correlate!
function computeGroupCenteredCosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let meanA = 0;
  let meanB = 0;
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

// Normalized Euclidean distance converted to [0, 1] similarity
function computeEuclideanSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  const dist = Math.sqrt(sumSq);
  // For unit-norm vectors, max dist is 2.0 (opposite direction). 0.0 is identical.
  return Math.max(0, 1 - dist / Math.SQRT2);
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

    // Search for first prominent peak in autocorrelation to avoid subharmonic doubling
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

    // Find first local maximum above threshold 0.4
    let selectedLag = -1;
    let peakVal = 0.4;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (r[lag] > r[lag - 1] && r[lag] > r[lag + 1] && r[lag] > peakVal) {
        selectedLag = lag;
        peakVal = r[lag];
        break; // First harmonic peak found!
      }
    }

    // If no first peak found, fall back to global max
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

async function run() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  const enrolled = decryptBiometricTemplate(profile!.voiceVoiceprintHash!, jwtSecret)!;

  const arpitVowels: [number, number, number][] = [
    [700, 1220, 2550], [310, 2250, 2900], [360, 850, 2450], [500, 950, 2500],
  ];
  const arpitSpeech1 = generateSentenceSpeech(118, arpitVowels);
  const arpitSpeech2 = generateSentenceSpeech(124, arpitVowels);

  const motherVowels: [number, number, number][] = [
    [850, 1450, 3050], [380, 2650, 3450], [430, 1020, 2950], [600, 1150, 3000],
  ];
  const motherSpeech1 = generateSentenceSpeech(215, motherVowels);
  const motherSpeech2 = generateSentenceSpeech(225, motherVowels);

  const otherMaleVowels: [number, number, number][] = [
    [620, 1100, 2350], [280, 2050, 2700], [320, 780, 2300], [460, 880, 2350],
  ];
  const otherMaleSpeech = generateSentenceSpeech(95, otherMaleVowels);

  const speakers = [
    { name: 'Arpit Utterance 1 (Owner)', audio: arpitSpeech1, isOwner: true },
    { name: 'Arpit Utterance 2 (Owner)', audio: arpitSpeech2, isOwner: true },
    { name: 'Mother Utterance 1 (Mother)', audio: motherSpeech1, isOwner: false },
    { name: 'Mother Utterance 2 (Mother)', audio: motherSpeech2, isOwner: false },
    { name: 'Other Male (Different Male)', audio: otherMaleSpeech, isOwner: false },
  ];

  for (const sp of speakers) {
    const ext = extractAcousticFeatureVector(sp.audio, 16000);
    const pitch = getAccuratePitchF0(sp.audio, 16000);

    // Group-centered cosine similarities:
    const formantsSim = computeGroupCenteredCosine(enrolled.slice(0, 16), ext.vector.slice(0, 16));
    const pitchBinsSim = computeGroupCenteredCosine(enrolled.slice(16, 24), ext.vector.slice(16, 24));
    const spectralSim = computeGroupCenteredCosine(enrolled.slice(24, 27), ext.vector.slice(24, 27));

    // Pitch range check:
    // Arpit pitch from template is ~97-120 Hz
    const isPitchInRange = pitch.f0 >= 75 && pitch.f0 <= 145;

    // Euclidean distance
    const euclideanSim = computeEuclideanSimilarity(enrolled, ext.vector);

    console.log(`\n-----------------------------------------`);
    console.log(`Speaker: ${sp.name} [Expected: ${sp.isOwner ? 'OWNER' : 'GUEST'}]`);
    console.log(`  Pitch F0: ${pitch.f0.toFixed(1)} Hz (Conf: ${pitch.confidence.toFixed(2)}) -> Valid Owner Pitch: ${isPitchInRange}`);
    console.log(`  Group-Centered Formants (0-15) Sim:  ${formantsSim.toFixed(4)}`);
    console.log(`  Group-Centered Pitch Bins (16-23) Sim: ${pitchBinsSim.toFixed(4)}`);
    console.log(`  Group-Centered Spectral (24-26) Sim:   ${spectralSim.toFixed(4)}`);
    console.log(`  Euclidean Vector Similarity:           ${euclideanSim.toFixed(4)}`);
  }
}

run().finally(() => prisma.$disconnect());

