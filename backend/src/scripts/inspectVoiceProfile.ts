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

async function main() {
  const profiles = await prisma.trustProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  console.log(`Found ${profiles.length} trust profiles in database:`);
  for (const prof of profiles) {
    console.log('User:', prof.user.name, prof.user.email, {
      voiceBiometricsEnabled: prof.voiceBiometricsEnabled,
      updatedAt: prof.updatedAt,
      hasTemplate: !!prof.voiceVoiceprintHash,
    });

    if (prof.voiceVoiceprintHash) {
      const vector = decryptBiometricTemplate(prof.voiceVoiceprintHash, jwtSecret);
      console.log('Decrypted vector length:', vector?.length);
      console.log('Vector components:', {
        formants_0_15: vector?.slice(0, 16).map(v => Number(v.toFixed(3))),
        pitch_16_23: vector?.slice(16, 24).map(v => Number(v.toFixed(3))),
        spectral_24_26: vector?.slice(24, 27).map(v => Number(v.toFixed(3))),
        temporal_27_31: vector?.slice(27, 32).map(v => Number(v.toFixed(3))),
      });
    }
  }
}

main().finally(() => prisma.$disconnect());

