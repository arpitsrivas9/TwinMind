import { prisma } from '../lib/prisma';
import crypto from 'crypto';

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

// Robust pitch estimation using Normalized Cross-Correlation Function (NCCF)
export function estimateFundamentalFrequency(samples: Float32Array, sampleRate: number): { f0: number; voicedRatio: number } {
  const frameSize = Math.min(1024, samples.length);
  const hopSize = Math.floor(frameSize / 2);
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const minPitch = 70;  // Hz
  const maxPitch = 400; // Hz
  const minLag = Math.floor(sampleRate / maxPitch);
  const maxLag = Math.floor(sampleRate / minPitch);

  const pitches: number[] = [];
  let voicedFrames = 0;

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      sumSq += samples[start + i] * samples[start + i];
    }
    const rms = Math.sqrt(sumSq / frameSize);
    if (rms < 0.015) continue; // silence / noise

    // Autocorrelation / NCCF across all lags from minLag to maxLag
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

    if (bestCorr > 0.45 && bestLag > 0) {
      pitches.push(sampleRate / bestLag);
      voicedFrames++;
    }
  }

  if (pitches.length === 0) return { f0: 0, voicedRatio: 0 };
  pitches.sort((a, b) => a - b);
  const medianF0 = pitches[Math.floor(pitches.length / 2)];
  const voicedRatio = voicedFrames / Math.max(1, numFrames);

  return { f0: medianF0, voicedRatio };
}

// Infer owner's fundamental frequency profile from enrolled 32-bin template
function inferOwnerPitchFromTemplate(enrolledTemplate: number[], sampleRate = 16000): { peakPitchLagIdx: number; approxF0: number } {
  const numPitchLags = 8;
  const minLag = Math.max(2, Math.round(sampleRate / 350));
  const maxLag = Math.min(512 - 2, Math.round(sampleRate / 75));
  const pitchLags: number[] = [];
  for (let p = 0; p < numPitchLags; p++) {
    pitchLags.push(Math.round(minLag + (maxLag - minLag) * (p / (numPitchLags - 1))));
  }

  // Find peak in pitch lag bins 16..23
  let peakIdx = 0;
  let peakVal = -Infinity;
  for (let p = 0; p < numPitchLags; p++) {
    const val = enrolledTemplate[16 + p];
    if (val > peakVal) {
      peakVal = val;
      peakIdx = p;
    }
  }

  const approxLag = pitchLags[peakIdx];
  const approxF0 = sampleRate / approxLag;
  return { peakPitchLagIdx: peakIdx, approxF0 };
}

async function run() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  const enrolled = decryptBiometricTemplate(profile!.voiceVoiceprintHash!, jwtSecret)!;
  const ownerPitch = inferOwnerPitchFromTemplate(enrolled);
  console.log('Inferred Owner Pitch from Enrolled Template:');
  console.log(`Peak pitch bin index: ${ownerPitch.peakPitchLagIdx} -> Approx F0: ${ownerPitch.approxF0.toFixed(1)} Hz`);
  console.log('Pitch bins 16-23:', enrolled.slice(16, 24));
}

run().finally(() => prisma.$disconnect());

