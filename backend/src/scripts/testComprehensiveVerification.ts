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

function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(-1, Math.min(1, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))));
}

// Robust pitch estimation using Normalized Cross-Correlation Function (NCCF)
export function estimatePitchF0(samples: Float32Array, sampleRate: number): { f0: number; voicedRatio: number; confidence: number } {
  const frameSize = Math.min(1024, samples.length);
  const hopSize = Math.floor(frameSize / 2);
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const minPitch = 70;  // Hz
  const maxPitch = 380; // Hz
  const minLag = Math.floor(sampleRate / maxPitch);
  const maxLag = Math.floor(sampleRate / minPitch);

  const pitches: number[] = [];
  const corrs: number[] = [];

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      sumSq += samples[start + i] * samples[start + i];
    }
    const rms = Math.sqrt(sumSq / frameSize);
    if (rms < 0.012) continue; // silence

    let bestCorr = -1;
    let bestLag = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      let den1 = 0;
      let den2 = 0;
      for (let i = 0; i < frameSize - lag; i++) {
        const s1 = samples[start + i];
        const s2 = samples[start + i + lag];
        num += s1 * s2;
        den1 += s1 * s1;
        den2 += s2 * s2;
      }
      const den = Math.sqrt(den1 * den2);
      if (den > 1e-6) {
        const nccf = num / den;
        if (nccf > bestCorr) {
          bestCorr = nccf;
          bestLag = lag;
        }
      }
    }

    if (bestCorr > 0.40 && bestLag > 0) {
      pitches.push(sampleRate / bestLag);
      corrs.push(bestCorr);
    }
  }

  if (pitches.length === 0) return { f0: 0, voicedRatio: 0, confidence: 0 };
  pitches.sort((a, b) => a - b);
  const medianF0 = pitches[Math.floor(pitches.length / 2)];
  const voicedRatio = pitches.length / Math.max(1, numFrames);
  const avgCorr = corrs.reduce((a, b) => a + b, 0) / corrs.length;

  return { f0: medianF0, voicedRatio, confidence: avgCorr };
}

// Inferred Owner Pitch from Enrolled Template bins 16-23
export function getOwnerPitchProfile(enrolledTemplate: number[], sampleRate = 16000): { peakBin: number; expectedF0: number; f0Min: number; f0Max: number } {
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
  // Allow normal human prosodic pitch variation: [0.75 * F0, 1.35 * F0]
  // bounded by human voice range
  const f0Min = Math.max(65, expectedF0 * 0.70);
  const f0Max = Math.min(380, expectedF0 * 1.38);

  return { peakBin: peakIdx, expectedF0, f0Min, f0Max };
}

// Generate realistic speech samples
function generateVoice(f0: number, formants: number[], sampleRate = 16000, durationSec = 1.5): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const T0 = 1 / f0;
    const pos = (t % T0) / T0;
    let glottal = 0;
    if (pos < 0.4) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * pos / 0.4));
    } else if (pos < 0.56) {
      glottal = Math.cos(Math.PI * (pos - 0.4) / 0.32);
    }

    let resonances = 0;
    for (let fIdx = 0; fIdx < formants.length; fIdx++) {
      const f = formants[fIdx];
      const bw = 60 + f * 0.05;
      const decay = Math.exp(-Math.PI * bw * (pos * T0));
      resonances += (1 / (fIdx + 1)) * Math.sin(2 * Math.PI * f * t) * decay;
    }

    const speech = glottal * resonances;
    const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    samples[i] = speech * env * 0.5;
  }
  return samples;
}

async function testComprehensive() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  const enrolled = decryptBiometricTemplate(profile!.voiceVoiceprintHash!, jwtSecret)!;
  const ownerPitchProfile = getOwnerPitchProfile(enrolled);
  console.log('Owner Enrolled Pitch Profile:', ownerPitchProfile);

  const testCases = [
    { name: 'Arpit (118 Hz, /u/)', f0: 118, formants: [350, 800, 2400], isOwner: true },
    { name: 'Arpit (125 Hz, /i/)', f0: 125, formants: [300, 2200, 2900], isOwner: true },
    { name: 'Arpit (115 Hz, phrase)', f0: 115, formants: [500, 1500, 2500], isOwner: true },
    { name: 'Mother (210 Hz, /a/)', f0: 210, formants: [850, 1450, 3000], isOwner: false },
    { name: 'Mother (225 Hz, /i/)', f0: 225, formants: [380, 2600, 3400], isOwner: false },
    { name: 'Mother (215 Hz, /u/)', f0: 215, formants: [420, 950, 2800], isOwner: false },
    { name: 'Other Male (95 Hz, /a/)', f0: 95, formants: [650, 1100, 2300], isOwner: false },
    { name: 'Other Male (155 Hz, /e/)', f0: 155, formants: [600, 1800, 2600], isOwner: false },
  ];

  console.log('\n--- COMPREHENSIVE SPEAKER VERIFICATION TEST ---');
  for (const tc of testCases) {
    const audio = generateVoice(tc.f0, tc.formants);
    const extraction = extractAcousticFeatureVector(audio, 16000);
    const queryPitch = estimatePitchF0(audio, 16000);
    const rawCosine = computeCosineSimilarity(enrolled, extraction.vector);

    // Formant sub-vector cosine similarity (bins 0-15)
    const formantEnrolled = enrolled.slice(0, 16);
    const formantQuery = extraction.vector.slice(0, 16);
    const formantSim = computeCosineSimilarity(formantEnrolled, formantQuery);

    // Pitch consistency check
    const pitchRatio = queryPitch.f0 > 0 ? queryPitch.f0 / ownerPitchProfile.expectedF0 : 1;
    const pitchMatch = queryPitch.f0 >= ownerPitchProfile.f0Min && queryPitch.f0 <= ownerPitchProfile.f0Max;

    // Pitch penalty factor
    let pitchPenalty = 1.0;
    if (queryPitch.f0 > 0 && queryPitch.confidence > 0.4) {
      if (!pitchMatch) {
        const pitchDist = Math.abs(queryPitch.f0 - ownerPitchProfile.expectedF0) / ownerPitchProfile.expectedF0;
        pitchPenalty = Math.max(0, 1.0 - pitchDist * 1.5);
      }
    }

    // Combined score
    const combinedScore = rawCosine * pitchPenalty;

    console.log(`[${tc.name}] (Expected Owner: ${tc.isOwner})`);
    console.log(`  Raw Cosine Sim: ${rawCosine.toFixed(4)}, Formant Sim: ${formantSim.toFixed(4)}, Pitch Ratio: ${pitchRatio.toFixed(2)}`);
    console.log(`  Query Pitch F0: ${queryPitch.f0.toFixed(1)} Hz (Conf: ${queryPitch.confidence.toFixed(2)})`);
    console.log(`  Pitch In Owner Range [${ownerPitchProfile.f0Min.toFixed(0)}-${ownerPitchProfile.f0Max.toFixed(0)} Hz]: ${pitchMatch}`);
    console.log(`  Pitch Penalty: ${pitchPenalty.toFixed(4)}`);
    console.log(`  Combined Verified Score: ${combinedScore.toFixed(4)}`);
    console.log(`  Decision (Threshold 0.75): ${combinedScore >= 0.75 ? 'OWNER_MATCH' : 'NON_OWNER'}\n`);
  }
}

testComprehensive().finally(() => prisma.$disconnect());

