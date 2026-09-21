import { extractAcousticFeatureVector } from '../services/trust/biometricProviders';

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

// Generate synthetic acoustic samples representing different human speakers:
// Speaker 1 (Owner - e.g. adult male, fundamental pitch ~125 Hz, formants at 500, 1500, 2500 Hz)
// Speaker 2 (Mother - e.g. adult female, fundamental pitch ~220 Hz, formants at 750, 2100, 3100 Hz)
// Speaker 3 (Different male speaker - pitch ~100 Hz, formants at 450, 1350, 2300 Hz)
// Speaker 4 (Child / Higher pitch - pitch ~280 Hz, formants at 900, 2400, 3400 Hz)

function generateVoice(f0: number, formants: number[], sampleRate = 16000, durationSec = 2.0): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Glottal excitation with harmonics
    let excitation = 0;
    for (let h = 1; h <= 15; h++) {
      const harmonicFreq = f0 * h;
      if (harmonicFreq < sampleRate / 2) {
        excitation += (1 / h) * Math.sin(2 * Math.PI * harmonicFreq * t);
      }
    }

    // Vocal tract resonances (formants)
    let vocalTract = 0;
    for (const f of formants) {
      const bandwidth = 80;
      vocalTract += Math.sin(2 * Math.PI * f * t) * Math.exp(-((t % (1 / f0)) * bandwidth));
    }

    // Combined vocal signal + slight natural modulation
    const speech = 0.5 * excitation + 0.5 * vocalTract;
    const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    samples[i] = speech * envelope * 0.4;
  }

  return samples;
}

const sampleRate = 16000;
const ownerAudio = generateVoice(125, [500, 1500, 2500]);
const motherAudio = generateVoice(220, [750, 2100, 3100]);
const maleAudio2 = generateVoice(100, [450, 1350, 2300]);
const femaleAudio2 = generateVoice(240, [800, 2200, 3200]);

const ownerVec = extractAcousticFeatureVector(ownerAudio, sampleRate).vector;
const motherVec = extractAcousticFeatureVector(motherAudio, sampleRate).vector;
const male2Vec = extractAcousticFeatureVector(maleAudio2, sampleRate).vector;
const female2Vec = extractAcousticFeatureVector(femaleAudio2, sampleRate).vector;

console.log('Cosine similarities:');
console.log('Owner vs Owner (same):', computeCosineSimilarity(ownerVec, ownerVec));
console.log('Owner vs Mother (different pitch & formants):', computeCosineSimilarity(ownerVec, motherVec));
console.log('Owner vs Other Male (different pitch):', computeCosineSimilarity(ownerVec, male2Vec));
console.log('Mother vs Other Female:', computeCosineSimilarity(motherVec, female2Vec));
console.log('Threshold currently configured:', 0.80);

