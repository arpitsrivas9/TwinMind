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

function generateVoice(f0: number, formants: number[], sampleRate = 16000, durationSec = 2.0): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let excitation = 0;
    for (let h = 1; h <= 20; h++) {
      const harmonicFreq = f0 * h;
      if (harmonicFreq < sampleRate / 2) {
        excitation += (1 / h) * Math.sin(2 * Math.PI * harmonicFreq * t);
      }
    }

    let vocalTract = 0;
    for (const f of formants) {
      const bandwidth = 100;
      vocalTract += Math.sin(2 * Math.PI * f * t) * Math.exp(-((t % (1 / f0)) * bandwidth));
    }

    const speech = 0.6 * excitation + 0.4 * vocalTract;
    const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    samples[i] = speech * envelope * 0.4;
  }

  return samples;
}

async function testAgainstStoredTemplate() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  if (!profile || !profile.voiceVoiceprintHash) {
    console.log('No enrolled template for Arpit found.');
    return;
  }

  const enrolledOwnerVector = decryptBiometricTemplate(profile.voiceVoiceprintHash, jwtSecret);
  if (!enrolledOwnerVector) {
    console.log('Could not decrypt template.');
    return;
  }

  console.log('Enrolled Owner Vector decrypted (32 bins):');
  console.log(enrolledOwnerVector);

  // Test against various female voices (pitch 200-260 Hz, formants typical of adult female)
  const motherF210 = generateVoice(210, [650, 1900, 2900]);
  const motherF230 = generateVoice(230, [700, 2100, 3100]);
  const motherF250 = generateVoice(250, [750, 2200, 3200]);

  // Test against male voices (pitch 110-140 Hz)
  const maleOwnerLike = generateVoice(125, [500, 1500, 2500]);
  const maleOther = generateVoice(95, [400, 1300, 2200]);

  const motherVec210 = extractAcousticFeatureVector(motherF210, 16000).vector;
  const motherVec230 = extractAcousticFeatureVector(motherF230, 16000).vector;
  const motherVec250 = extractAcousticFeatureVector(motherF250, 16000).vector;
  const maleLikeVec = extractAcousticFeatureVector(maleOwnerLike, 16000).vector;
  const maleOtherVec = extractAcousticFeatureVector(maleOther, 16000).vector;

  console.log('\n--- SIMILARITY AGAINST ARPIT STORED TEMPLATE ---');
  console.log('Female Voice 1 (210 Hz, Mother):', computeCosineSimilarity(enrolledOwnerVector, motherVec210));
  console.log('Female Voice 2 (230 Hz, Mother):', computeCosineSimilarity(enrolledOwnerVector, motherVec230));
  console.log('Female Voice 3 (250 Hz, Mother):', computeCosineSimilarity(enrolledOwnerVector, motherVec250));
  console.log('Male Voice (125 Hz):', computeCosineSimilarity(enrolledOwnerVector, maleLikeVec));
  console.log('Male Voice (95 Hz):', computeCosineSimilarity(enrolledOwnerVector, maleOtherVec));
  console.log('Current Threshold: 0.80');
}

testAgainstStoredTemplate().finally(() => prisma.$disconnect());

