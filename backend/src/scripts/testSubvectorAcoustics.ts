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
    // Natural intonation: rise-fall intonation arch across the sentence
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

async function run() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  const enrolled = decryptBiometricTemplate(profile!.voiceVoiceprintHash!, jwtSecret)!;

  // Sentences: Sequence of vowels /a/ -> /i/ -> /u/ -> /o/
  // Arpit (Male vocal tract: ~17cm length, F0 ~ 118 Hz)
  const arpitVowels: [number, number, number][] = [
    [700, 1220, 2550], // /a/
    [310, 2250, 2900], // /i/
    [360, 850, 2450],  // /u/
    [500, 950, 2500],  // /o/
  ];
  const arpitSpeech1 = generateSentenceSpeech(118, arpitVowels);
  const arpitSpeech2 = generateSentenceSpeech(122, arpitVowels); // slight intonation diff

  // Mother (Female vocal tract: ~14cm length, +20% higher formants, F0 ~ 215 Hz)
  const motherVowels: [number, number, number][] = [
    [850, 1450, 3050], // /a/
    [380, 2650, 3450], // /i/
    [430, 1020, 2950], // /u/
    [600, 1150, 3000], // /o/
  ];
  const motherSpeech1 = generateSentenceSpeech(215, motherVowels);
  const motherSpeech2 = generateSentenceSpeech(225, motherVowels);

  // Other Male (Low pitch 95 Hz, formants [620, 1100, 2350])
  const otherMaleVowels: [number, number, number][] = [
    [620, 1100, 2350],
    [280, 2050, 2700],
    [320, 780, 2300],
    [460, 880, 2350],
  ];
  const otherMaleSpeech = generateSentenceSpeech(95, otherMaleVowels);

  const vArpit1 = extractAcousticFeatureVector(arpitSpeech1, 16000).vector;
  const vArpit2 = extractAcousticFeatureVector(arpitSpeech2, 16000).vector;
  const vMother1 = extractAcousticFeatureVector(motherSpeech1, 16000).vector;
  const vMother2 = extractAcousticFeatureVector(motherSpeech2, 16000).vector;
  const vOtherMale = extractAcousticFeatureVector(otherMaleSpeech, 16000).vector;

  const compare = (name: string, query: number[]) => {
    const fullCos = computeCosineSimilarity(enrolled, query);
    const formantsCos = computeCosineSimilarity(enrolled.slice(0, 16), query.slice(0, 16));
    const pitchCos = computeCosineSimilarity(enrolled.slice(16, 24), query.slice(16, 24));
    const spectralCos = computeCosineSimilarity(enrolled.slice(24, 27), query.slice(24, 27));
    const temporalCos = computeCosineSimilarity(enrolled.slice(27, 32), query.slice(27, 32));

    console.log(`=== ${name} ===`);
    console.log(`  Full 32-bin Cosine:     ${fullCos.toFixed(4)}`);
    console.log(`  Formants (0-15) Cosine:  ${formantsCos.toFixed(4)}`);
    console.log(`  Pitch (16-23) Cosine:    ${pitchCos.toFixed(4)}`);
    console.log(`  Spectral (24-26) Cosine: ${spectralCos.toFixed(4)}`);
    console.log(`  Temporal (27-31) Cosine: ${temporalCos.toFixed(4)}`);
  };

  compare('Arpit Sentence 1 (Owner)', vArpit1);
  compare('Arpit Sentence 2 (Owner)', vArpit2);
  compare('Mother Sentence 1 (Unknown Speaker)', vMother1);
  compare('Mother Sentence 2 (Unknown Speaker)', vMother2);
  compare('Other Male Sentence (Different Male)', vOtherMale);
}

run().finally(() => prisma.$disconnect());

