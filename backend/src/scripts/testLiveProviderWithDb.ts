import { prisma } from '../lib/prisma';
import { defaultVoiceBiometricProvider } from '../services/trust/biometricProviders';

function generateSentenceWav(
  f0Base: number,
  formantTrajectory: [number, number, number][],
  sampleRate = 16000,
  durationSec = 2.0
): Buffer {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

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
    const sample = Math.round(Math.max(-1, Math.min(1, speech * envelope * 0.4)) * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

async function testLiveProvider() {
  const profile = await prisma.trustProfile.findFirst({
    where: { user: { email: 'arpitsrivastava7176@gmail.com' } },
  });

  const encryptedTemplate = profile!.voiceVoiceprintHash!;

  const arpitVowels: [number, number, number][] = [
    [700, 1220, 2550], [310, 2250, 2900], [360, 850, 2450], [500, 950, 2500],
  ];
  const arpitWav = generateSentenceWav(118, arpitVowels);

  const motherVowels: [number, number, number][] = [
    [850, 1450, 3050], [380, 2650, 3450], [430, 1020, 2950], [600, 1150, 3000],
  ];
  const motherWav = generateSentenceWav(215, motherVowels);

  console.log('--- TESTING DEFAULT VOICE BIOMETRIC PROVIDER ---');

  const resArpit = await defaultVoiceBiometricProvider.verifyVoice('owner_id', arpitWav, encryptedTemplate);
  console.log('\nArpit Query Result:');
  console.log('  Verified:', resArpit.verified);
  console.log('  Voice State:', resArpit.voiceState);
  console.log('  Confidence:', resArpit.confidence);
  console.log('  Details:', resArpit.details);

  const resMother = await defaultVoiceBiometricProvider.verifyVoice('owner_id', motherWav, encryptedTemplate);
  console.log('\nMother Query Result:');
  console.log('  Verified:', resMother.verified);
  console.log('  Voice State:', resMother.voiceState);
  console.log('  Confidence:', resMother.confidence);
  console.log('  Details:', resMother.details);
}

testLiveProvider().finally(() => prisma.$disconnect());

