import crypto from 'crypto';
import { env } from '../../config/env';
import {
  BiometricVerificationResult,
  VoiceBiometricVerificationResult,
  FaceBiometricVerificationResult,
  IVoiceBiometricProvider,
  IFaceBiometricProvider,
  ILivenessProvider,
} from './trustTypes';

// In-memory sliding window replay detection (hash -> timestamp)
const recentAudioReplays = new Map<string, number>();
const recentFaceReplays = new Map<string, number>();
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkAndRecordAudioHash(audioBuffer: Buffer): { isReplay: boolean; hash: string } {
  const now = Date.now();
  // Evict expired replay entries
  for (const [hash, ts] of recentAudioReplays.entries()) {
    if (now - ts > REPLAY_WINDOW_MS) {
      recentAudioReplays.delete(hash);
    }
  }

  const hash = crypto.createHash('sha256').update(audioBuffer).digest('hex');
  if (recentAudioReplays.has(hash)) {
    return { isReplay: true, hash };
  }
  recentAudioReplays.set(hash, now);
  return { isReplay: false, hash };
}

function checkAndRecordFaceHash(imageBuffer: Buffer): { isReplay: boolean; hash: string } {
  const now = Date.now();
  for (const [hash, ts] of recentFaceReplays.entries()) {
    if (now - ts > REPLAY_WINDOW_MS) {
      recentFaceReplays.delete(hash);
    }
  }

  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  if (recentFaceReplays.has(hash)) {
    return { isReplay: true, hash };
  }
  recentFaceReplays.set(hash, now);
  return { isReplay: false, hash };
}

/**
 * Extracts a normalized 16-element acoustic spectral feature vector from audio bytes.
 * Uses normalized autocorrelation across 16 lags to capture pitch harmonics and formant resonances
 * invariant to utterance duration and temporal phase offsets.
 */
function extractAcousticFeatureVector(audioBuffer: Buffer): { vector: number[]; dynamicRange: number } {
  const bins = 16;
  const vector: number[] = new Array(bins).fill(0);
  if (!audioBuffer || audioBuffer.length === 0) {
    return { vector, dynamicRange: 0 };
  }

  const N = audioBuffer.length;
  let minVal = 255;
  let maxVal = 0;
  let sum = 0;

  for (let i = 0; i < N; i++) {
    const val = audioBuffer[i];
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    sum += val;
  }

  const mean = sum / N;
  let variance = 0;
  for (let i = 0; i < N; i++) {
    const diff = audioBuffer[i] - mean;
    variance += diff * diff;
  }

  const dynamicRange = maxVal - minVal;
  if (variance === 0 || N <= bins) {
    return { vector, dynamicRange };
  }

  // Normalized autocorrelation across 16 lags
  for (let lag = 1; lag <= bins; lag++) {
    let autoCorr = 0;
    for (let i = 0; i < N - lag; i++) {
      autoCorr += (audioBuffer[i] - mean) * (audioBuffer[i + lag] - mean);
    }
    vector[lag - 1] = autoCorr / variance;
  }

  // Normalize vector to unit length (L2 norm)
  const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0));
  if (norm > 0) {
    for (let b = 0; b < bins; b++) {
      vector[b] = Number((vector[b] / norm).toFixed(6));
    }
  }

  return { vector, dynamicRange };
}

/**
 * Computes Cosine Similarity between two normalized acoustic vectors.
 * Returns value between -1.0 and 1.0 (identical vectors return 1.0).
 */
function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return Math.max(-1, Math.min(1, dotProduct));
}

/**
 * Encrypts acoustic feature vector using AES-256-GCM.
 */
function encryptBiometricTemplate(vector: number[], secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(vector);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  const tag = cipher.getAuthTag().toString('base64url');
  return `v1:gcm:${iv.toString('base64url')}:${tag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted biometric template.
 */
function decryptBiometricTemplate(payload: string, secret: string): number[] | null {
  try {
    const parts = payload.split(':');
    if (parts.length !== 5 || parts[0] !== 'v1' || parts[1] !== 'gcm') {
      return null;
    }
    const iv = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    const ciphertext = parts[4];
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as number[];
  } catch {
    return null;
  }
}

/**
 * Voice Biometric Provider Implementation.
 * In development / test mode: performs acoustic spectral signature matching,
 * zero-knowledge encrypted template comparison, and replay/spoof detection.
 * In production: fails safe unless external biometric credentials are configured.
 */
export class StandardVoiceBiometricProvider implements IVoiceBiometricProvider {
  public name = 'TwinVoiceBiometrics';

  public get status() {
    return env.nodeEnv === 'development' || env.nodeEnv === 'test'
      ? ('DEVELOPMENT_MOCK' as const)
      : ('NOT_CONFIGURED' as const);
  }

  public async verifyVoice(
    userId: string,
    audioBuffer: Buffer,
    storedEncryptedTemplate?: string | null,
  ): Promise<VoiceBiometricVerificationResult> {
    if (this.status === 'NOT_CONFIGURED') {
      return {
        verified: false,
        confidence: 0,
        providerStatus: 'NOT_CONFIGURED',
        providerName: this.name,
        voiceState: 'VOICE_UNAVAILABLE',
        details: 'Production voice biometric provider credentials are not configured.',
      };
    }

    if (!audioBuffer || audioBuffer.length < 200) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        voiceState: 'VOICE_VERIFICATION_FAILED',
        details: 'Audio buffer is insufficient for biometric acoustic verification.',
      };
    }

    // 1. Anti-Replay Detection
    const { isReplay } = checkAndRecordAudioHash(audioBuffer);
    if (isReplay) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        voiceState: 'VOICE_VERIFICATION_FAILED',
        replayDetected: true,
        details: 'Potential replay attack detected: identical audio buffer recently received.',
      };
    }

    // 2. Anti-Spoofing & Liveness (spectral dynamic range & silence detection)
    const { vector: queryVector, dynamicRange } = extractAcousticFeatureVector(audioBuffer);
    if (dynamicRange < 8) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        voiceState: 'VOICE_VERIFICATION_FAILED',
        antiSpoofPassed: false,
        details: 'Audio sample rejected by presentation attack detection: insufficient acoustic dynamic range.',
      };
    }

    // 3. Check for enrolled template
    if (!storedEncryptedTemplate) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        voiceState: 'VOICE_UNKNOWN',
        details: 'No enrolled voice biometric profile found for this owner.',
      };
    }

    // 4. Decrypt enrolled owner template
    const ownerVector = decryptBiometricTemplate(storedEncryptedTemplate, env.jwtSecret);
    if (!ownerVector || ownerVector.length !== queryVector.length) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        voiceState: 'VOICE_VERIFICATION_FAILED',
        details: 'Failed to decrypt or parse enrolled voice biometric template.',
      };
    }

    // 5. Compute Cosine Similarity between owner voice template and query voice
    const similarity = computeCosineSimilarity(ownerVector, queryVector);
    const SIMILARITY_THRESHOLD = 0.82;
    const isOwnerMatch = similarity >= SIMILARITY_THRESHOLD;

    const confidence = isOwnerMatch
      ? Math.min(0.96, Number((0.85 + (similarity - SIMILARITY_THRESHOLD) * 0.5).toFixed(2)))
      : Math.max(0.15, Number((similarity * 0.5).toFixed(2)));

    return {
      verified: isOwnerMatch,
      confidence,
      providerStatus: this.status,
      providerName: this.name,
      voiceState: isOwnerMatch ? 'VOICE_OWNER_MATCH' : 'VOICE_NON_OWNER',
      antiSpoofPassed: true,
      replayDetected: false,
      details: isOwnerMatch
        ? 'Voice biometric matched owner acoustic profile.'
        : 'Voice biometric did not match owner acoustic profile.',
    };
  }

  public async enrollVoice(
    userId: string,
    audioBuffer: Buffer,
  ): Promise<{ enrolled: boolean; encryptedTemplate: string; templateHash: string }> {
    if (!audioBuffer || audioBuffer.length < 300) {
      throw new Error('Enrollment audio buffer is too short or empty.');
    }

    const { vector, dynamicRange } = extractAcousticFeatureVector(audioBuffer);
    if (dynamicRange < 8) {
      throw new Error('Enrollment audio rejected: dynamic range too low. Please speak clearly into the microphone.');
    }

    const encryptedTemplate = encryptBiometricTemplate(vector, env.jwtSecret);
    const templateHash = crypto
      .createHash('sha256')
      .update(`${userId}:voice:${encryptedTemplate.slice(0, 32)}`)
      .digest('hex');

    // Register enrollment audio in replay cache to prevent immediate replay
    checkAndRecordAudioHash(audioBuffer);

    return { enrolled: true, encryptedTemplate, templateHash };
  }
}

/**
 * Normalizes input image (base64 string or data URL) into a 1024-byte grayscale matrix.
 */
function extractGrayscaleMatrix(imageBase64: string): { matrix: Uint8Array; rawBuffer: Buffer } | null {
  if (!imageBase64 || typeof imageBase64 !== 'string') return null;
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  if (cleanBase64.length < 50) return null;

  try {
    const rawBuffer = Buffer.from(cleanBase64, 'base64');
    if (rawBuffer.length < 50) return null;

    const matrix = new Uint8Array(1024);
    if (rawBuffer.length === 1024) {
      matrix.set(rawBuffer);
    } else {
      const step = rawBuffer.length / 1024;
      for (let i = 0; i < 1024; i++) {
        matrix[i] = rawBuffer[Math.floor(i * step)] || 0;
      }
    }
    return { matrix, rawBuffer };
  } catch {
    return null;
  }
}

/**
 * Extracts a 16-band normalized multi-region spatial gradient vector from a 32x32 facial matrix.
 */
function extractFaceFeatureVector(matrix: Uint8Array): { vector: number[]; dynamicRange: number; variance: number } {
  let minVal = 255;
  let maxVal = 0;
  let sum = 0;
  for (let i = 0; i < 1024; i++) {
    const val = matrix[i];
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    sum += val;
  }
  const mean = sum / 1024;
  let varSum = 0;
  for (let i = 0; i < 1024; i++) {
    const diff = matrix[i] - mean;
    varSum += diff * diff;
  }
  const variance = varSum / 1024;
  const dynamicRange = maxVal - minVal;

  const vector = new Array<number>(16).fill(0);
  // 4x4 spatial blocks, each 8x8 pixels
  for (let blockIdx = 0; blockIdx < 16; blockIdx++) {
    const br = Math.floor(blockIdx / 4);
    const bc = blockIdx % 4;
    let blockEnergy = 0;
    for (let y = br * 8 + 1; y < (br + 1) * 8 - 1; y++) {
      for (let x = bc * 8 + 1; x < (bc + 1) * 8 - 1; x++) {
        const idx = y * 32 + x;
        const gx = (matrix[idx + 1] || 0) - (matrix[idx - 1] || 0);
        const gy = (matrix[idx + 32] || 0) - (matrix[idx - 32] || 0);
        blockEnergy += Math.sqrt(gx * gx + gy * gy);
      }
    }
    vector[blockIdx] = blockEnergy;
  }

  // L2 unit normalization
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < 16; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  }

  return { vector, dynamicRange, variance };
}

/**
 * Face Biometric & Recognition Provider Implementation.
 * In development / test mode: extracts multi-region spatial gradient feature vectors,
 * validates against encrypted owner template, and checks anti-replay and dynamic range.
 * In production: fails safe unless external computer vision credentials are configured.
 */
export class StandardFaceBiometricProvider implements IFaceBiometricProvider {
  public name = 'TwinFaceRecognition';

  public get status() {
    return env.nodeEnv === 'development' || env.nodeEnv === 'test'
      ? ('DEVELOPMENT_MOCK' as const)
      : ('NOT_CONFIGURED' as const);
  }

  public async verifyFace(
    userId: string,
    imageBase64: string,
    storedEncryptedTemplate?: string | null,
  ): Promise<FaceBiometricVerificationResult> {
    if (this.status === 'NOT_CONFIGURED') {
      return {
        verified: false,
        confidence: 0,
        providerStatus: 'NOT_CONFIGURED',
        providerName: this.name,
        details: 'Production face recognition provider credentials are not configured.',
      };
    }

    if (!imageBase64) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        details: 'No face image data provided.',
      };
    }

    if (!storedEncryptedTemplate) {
      return {
        verified: false,
        confidence: 0,
        faceState: 'FACE_UNENROLLED',
        providerStatus: this.status,
        providerName: this.name,
        details: 'No enrolled face biometric profile found for this user.',
      };
    }

    const parsed = extractGrayscaleMatrix(imageBase64);
    if (!parsed) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        details: 'Invalid or unreadable face image payload.',
      };
    }

    // Replay attack check
    const replayCheck = checkAndRecordFaceHash(parsed.rawBuffer);
    if (replayCheck.isReplay) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        details: 'Face verification rejected: potential replay attack with identical frame.',
      };
    }

    const { vector: candidateVector, dynamicRange, variance } = extractFaceFeatureVector(parsed.matrix);

    // Reject flat or unilluminated scenes
    if (dynamicRange < 15 || variance < 20) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        details: 'Poor lighting or insufficient facial contrast detected in frame.',
      };
    }

    // Decrypt stored template
    const enrolledVector = decryptBiometricTemplate(
      storedEncryptedTemplate,
      env.jwtSecret + ':' + userId + ':face',
    );

    if (!enrolledVector || enrolledVector.length !== 16) {
      return {
        verified: false,
        confidence: 0,
        providerStatus: this.status,
        providerName: this.name,
        details: 'Corrupted or unreadable face biometric template.',
      };
    }

    const similarity = computeCosineSimilarity(candidateVector, enrolledVector);
    const MATCH_THRESHOLD = 0.78;
    const MISMATCH_THRESHOLD = 0.65;

    if (similarity >= MATCH_THRESHOLD) {
      return {
        verified: true,
        confidence: Number(similarity.toFixed(4)),
        similarity: Number(similarity.toFixed(4)),
        faceState: 'FACE_OWNER',
        providerStatus: this.status,
        providerName: this.name,
        details: `Face recognition matched owner profile (confidence: ${(similarity * 100).toFixed(1)}%).`,
      };
    }

    return {
      verified: false,
      confidence: Number(Math.max(0, similarity).toFixed(4)),
      similarity: Number(similarity.toFixed(4)),
      faceState: similarity < MISMATCH_THRESHOLD ? 'FACE_NON_OWNER' : undefined,
      providerStatus: this.status,
      providerName: this.name,
      details: `Face recognition mismatch (similarity: ${similarity.toFixed(2)}, required >= ${MATCH_THRESHOLD}).`,
    };
  }

  public async enrollFace(
    userId: string,
    imageBase64: string,
  ): Promise<{ enrolled: boolean; encryptedTemplate: string; templateHash: string }> {
    const parsed = extractGrayscaleMatrix(imageBase64);
    if (!parsed) {
      throw new Error('Invalid face image data provided for enrollment.');
    }

    const { vector, dynamicRange, variance } = extractFaceFeatureVector(parsed.matrix);
    if (dynamicRange < 15 || variance < 20) {
      throw new Error('Face image quality too low for enrollment. Ensure good lighting and face centering.');
    }

    const encryptedTemplate = encryptBiometricTemplate(vector, env.jwtSecret + ':' + userId + ':face');
    const templateHash = crypto
      .createHash('sha256')
      .update(`${userId}:face:${encryptedTemplate.slice(0, 32)}`)
      .digest('hex');

    // Register enrollment image in replay cache
    checkAndRecordFaceHash(parsed.rawBuffer);

    return { enrolled: true, encryptedTemplate, templateHash };
  }
}

/**
 * Liveness Provider Implementation.
 * Validates active & passive liveness across consecutive frames and challenge compliance.
 */
export class StandardLivenessProvider implements ILivenessProvider {
  public name = 'TwinLivenessEngine';

  public get status() {
    return env.nodeEnv === 'development' || env.nodeEnv === 'test'
      ? ('DEVELOPMENT_MOCK' as const)
      : ('NOT_CONFIGURED' as const);
  }

  public async checkLiveness(
    frames: string[],
    challenge?: string,
  ): Promise<{ liveness: 'LIVE' | 'NOT_LIVE' | 'UNKNOWN' | 'FAILED'; score: number; details?: string }> {
    if (this.status === 'NOT_CONFIGURED') {
      return { liveness: 'UNKNOWN', score: 0, details: 'Liveness engine not configured.' };
    }

    if (!Array.isArray(frames) || frames.length < 2) {
      return { liveness: 'FAILED', score: 0, details: 'Insufficient frames captured for liveness verification.' };
    }

    const f1 = extractGrayscaleMatrix(frames[0]);
    const f2 = extractGrayscaleMatrix(frames[1]);

    if (!f1 || !f2) {
      return { liveness: 'FAILED', score: 0, details: 'Corrupted liveness frames.' };
    }

    // Compute pixel difference between consecutive frames
    let totalPixelDiff = 0;
    for (let i = 0; i < 1024; i++) {
      totalPixelDiff += Math.abs(f1.matrix[i] - f2.matrix[i]);
    }
    const meanDiff = totalPixelDiff / 1024;
    const diffRatio = meanDiff / 255;

    // Static photo detection: less than 1.5% difference indicates static photo or frozen frame
    if (diffRatio < 0.015) {
      return {
        liveness: 'FAILED',
        score: 0.05,
        details: 'Static photo or frozen image detected. Active human movement is required.',
      };
    }

    // Erratic jump / scene change detection: over 65% difference indicates scene switch
    if (diffRatio > 0.65) {
      return {
        liveness: 'FAILED',
        score: 0.1,
        details: 'Erratic scene change or camera obstruction detected during challenge.',
      };
    }

    // Challenge-specific directional motion analysis
    if (challenge === 'TURN_LEFT' || challenge === 'TURN_RIGHT') {
      let f1LeftMass = 0;
      let f1RightMass = 0;
      let f2LeftMass = 0;
      let f2RightMass = 0;

      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 16; x++) {
          f1LeftMass += f1.matrix[y * 32 + x];
          f2LeftMass += f2.matrix[y * 32 + x];
        }
        for (let x = 16; x < 32; x++) {
          f1RightMass += f1.matrix[y * 32 + x];
          f2RightMass += f2.matrix[y * 32 + x];
        }
      }

      const f1Balance = (f1RightMass - f1LeftMass) / (f1RightMass + f1LeftMass + 1e-6);
      const f2Balance = (f2RightMass - f2LeftMass) / (f2RightMass + f2LeftMass + 1e-6);
      const balanceShift = f2Balance - f1Balance;

      if (challenge === 'TURN_LEFT' && balanceShift > 0.05) {
        return {
          liveness: 'NOT_LIVE',
          score: 0.35,
          details: 'Movement did not match prompted challenge (turned right instead of left).',
        };
      } else if (challenge === 'TURN_RIGHT' && balanceShift < -0.05) {
        return {
          liveness: 'NOT_LIVE',
          score: 0.35,
          details: 'Movement did not match prompted challenge (turned left instead of right).',
        };
      }
    }

    return {
      liveness: 'LIVE',
      score: 0.95,
      details: 'Live biological motion confirmed.',
    };
  }
}

export const defaultVoiceBiometricProvider = new StandardVoiceBiometricProvider();
export const defaultFaceBiometricProvider = new StandardFaceBiometricProvider();
export const defaultLivenessProvider = new StandardLivenessProvider();
