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

// Generate realistic natural speech with glottal waveform and vowel formants
function generateVowelSpeech(f0: number, formants: number[], sampleRate = 16000, durationSec = 1.5): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Glottal Rosenberg pulse approximation
    const T0 = 1 / f0;
    const pos = (t % T0) / T0;
    let glottal = 0;
    if (pos < 0.4) {
      glottal = 0.5 * (1 - Math.cos(Math.PI * pos / 0.4));
    } else if (pos < 0.56) {
      glottal = Math.cos(Math.PI * (pos - 0.4) / 0.32);
    }

    // Resonances
    let resonances = 0;
    for (let fIdx = 0; fIdx < formants.length; fIdx++) {
      const f = formants[fIdx];
      const bw = 50 + f * 0.05;
      const decay = Math.exp(-Math.PI * bw * (pos * T0));
      resonances += (1 / (fIdx + 1)) * Math.sin(2 * Math.PI * f * t) * decay;
    }

    const speech = glottal * resonances;
    const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    samples[i] = speech * env * 0.5;
  }
  return samples;
}

async function run() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  if (!profile || !profile.voiceVoiceprintHash) {
    console.log('No profile found');
    return;
  }

  const enrolled = decryptBiometricTemplate(profile.voiceVoiceprintHash, jwtSecret);
  if (!enrolled) {
    console.log('Cannot decrypt');
    return;
  }

  console.log('Owner Template:');
  console.log(enrolled);

  // Different human voices with Rosenberg glottal pulse & realistic vowel formants:
  // Arpit (Owner) Vowels:
  // /a/ F1=700, F2=1200, F3=2500, F0=120
  // /i/ F1=300, F2=2200, F3=2900, F0=125
  // /u/ F1=350, F2=800, F3=2400, F0=118
  const arpitA = generateVowelSpeech(120, [700, 1200, 2500]);
  const arpitI = generateVowelSpeech(125, [300, 2200, 2900]);
  const arpitU = generateVowelSpeech(118, [350, 800, 2400]);

  // Mother (Female) Vowels:
  // Higher F0 (~220Hz), Shorter vocal tract (+20% formant shift):
  // /a/ F1=850, F2=1450, F3=3000, F0=210
  // /i/ F1=380, F2=2600, F3=3400, F0=225
  // /u/ F1=420, F2=950, F3=2800, F0=215
  const motherA = generateVowelSpeech(210, [850, 1450, 3000]);
  const motherI = generateVowelSpeech(225, [380, 2600, 3400]);
  const motherU = generateVowelSpeech(215, [420, 950, 2800]);

  // Another Male (Low pitch, F0=95Hz):
  const otherMaleA = generateVowelSpeech(95, [650, 1100, 2300]);

  const vArpitA = extractAcousticFeatureVector(arpitA, 16000);
  const vArpitI = extractAcousticFeatureVector(arpitI, 16000);
  const vArpitU = extractAcousticFeatureVector(arpitU, 16000);

  const vMotherA = extractAcousticFeatureVector(motherA, 16000);
  const vMotherI = extractAcousticFeatureVector(motherI, 16000);
  const vMotherU = extractAcousticFeatureVector(motherU, 16000);

  const vOtherMaleA = extractAcousticFeatureVector(otherMaleA, 16000);

  console.log('\n--- SIMILARITY AGAINST ENROLLED OWNER PROFILE ---');
  console.log('Arpit /a/:', computeCosineSimilarity(enrolled, vArpitA.vector));
  console.log('Arpit /i/:', computeCosineSimilarity(enrolled, vArpitI.vector));
  console.log('Arpit /u/:', computeCosineSimilarity(enrolled, vArpitU.vector));

  console.log('Mother /a/:', computeCosineSimilarity(enrolled, vMotherA.vector));
  console.log('Mother /i/:', computeCosineSimilarity(enrolled, vMotherI.vector));
  console.log('Mother /u/:', computeCosineSimilarity(enrolled, vMotherU.vector));

  console.log('Other Male /a/:', computeCosineSimilarity(enrolled, vOtherMaleA.vector));

  console.log('\n--- BIN CONTRIBUTIONS FOR MOTHER /i/ ---');
  let sumDot = 0;
  for (let b = 0; b < 32; b++) {
    const prod = enrolled[b] * vMotherI.vector[b];
    sumDot += prod;
    console.log(`Bin ${b.toString().padStart(2)}: enrolled=${enrolled[b].toFixed(4)}, mother=${vMotherI.vector[b].toFixed(4)}, product=${prod.toFixed(4)}`);
  }
  console.log('Total dot product:', sumDot);
}

run().finally(() => prisma.$disconnect());
