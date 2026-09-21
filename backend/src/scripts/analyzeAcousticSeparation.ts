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

// Generate realistic speech samples with harmonic excitation, formant filters, and natural speech modulation
function generateSpeech(f0: number, formants: [number, number, number], sampleRate = 16000, durationSec = 2.0): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(numSamples);

  // Formant frequencies & bandwidths
  const [f1, f2, f3] = formants;
  const bw1 = 80, bw2 = 100, bw3 = 120;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Slight natural pitch jitter (1%)
    const instF0 = f0 * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t));

    // Impulse train glottal source
    const period = 1 / instF0;
    const phase = (t % period) / period;
    const glottal = Math.exp(-phase * 8) - 0.2;

    // Resonate through 3 formants
    const r1 = Math.sin(2 * Math.PI * f1 * t) * Math.exp(-phase * bw1 * 0.05);
    const r2 = 0.5 * Math.sin(2 * Math.PI * f2 * t) * Math.exp(-phase * bw2 * 0.05);
    const r3 = 0.25 * Math.sin(2 * Math.PI * f3 * t) * Math.exp(-phase * bw3 * 0.05);

    const speech = glottal * (r1 + r2 + r3);
    const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    samples[i] = speech * envelope * 0.2;
  }

  return samples;
}

// Compare speakers across typical male and female ranges:
// Arpit (male, typical F0 ~110-135 Hz, Formants ~ 500, 1500, 2500 Hz)
// Mother (female, typical F0 ~190-240 Hz, Formants ~ 700, 2000, 2900 Hz)
const sampleRate = 16000;
const arpitSpeech1 = generateSpeech(120, [500, 1500, 2500], sampleRate);
const arpitSpeech2 = generateSpeech(125, [520, 1480, 2520], sampleRate); // Same speaker, natural variation
const motherSpeech1 = generateSpeech(210, [700, 2000, 2900], sampleRate); // Mother
const motherSpeech2 = generateSpeech(220, [720, 2050, 2950], sampleRate); // Mother another sentence
const otherMaleSpeech = generateSpeech(105, [450, 1400, 2400], sampleRate); // Another male

const vArpit1 = extractAcousticFeatureVector(arpitSpeech1, sampleRate);
const vArpit2 = extractAcousticFeatureVector(arpitSpeech2, sampleRate);
const vMother1 = extractAcousticFeatureVector(motherSpeech1, sampleRate);
const vMother2 = extractAcousticFeatureVector(motherSpeech2, sampleRate);
const vOtherMale = extractAcousticFeatureVector(otherMaleSpeech, sampleRate);

console.log('Arpit 1 vs Arpit 2 (Same speaker):', computeCosineSimilarity(vArpit1.vector, vArpit2.vector));
console.log('Mother 1 vs Mother 2 (Same speaker):', computeCosineSimilarity(vMother1.vector, vMother2.vector));
console.log('Arpit 1 vs Mother 1 (Different speaker / gender):', computeCosineSimilarity(vArpit1.vector, vMother1.vector));
console.log('Arpit 1 vs Mother 2 (Different speaker / gender):', computeCosineSimilarity(vArpit1.vector, vMother2.vector));
console.log('Arpit 1 vs Other Male (Different male):', computeCosineSimilarity(vArpit1.vector, vOtherMale.vector));

console.log('\nvArpit1 vector:', vArpit1.vector);
console.log('\nvMother1 vector:', vMother1.vector);

