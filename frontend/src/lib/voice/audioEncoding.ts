/**
 * TwinVoice™ — Audio Encoding & PCM Conversion Utilities
 *
 * Provides pure client-side conversion of WebM/OGG audio blobs to
 * 16-bit linear PCM uncompressed RIFF WAV blobs for server-side
 * biometric acoustic verification and enrollment.
 */

export function writeAsciiString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encodes Float32Array PCM chunks into standard 16-bit linear PCM RIFF WAV format.
 */
export function encodeWavBlob(chunks: Float32Array[], sampleRate: number): Blob {
  let totalSamples = 0;
  for (const chunk of chunks) {
    totalSamples += chunk.length;
  }

  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeAsciiString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAsciiString(view, 8, 'WAVE');

  // Subchunk 1: "fmt "
  writeAsciiString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat 1 = PCM
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate = SampleRate * NumChannels * 2
  view.setUint16(32, 2, true); // BlockAlign = NumChannels * 2
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // Subchunk 2: "data"
  writeAsciiString(view, 36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  // Samples (16-bit linear PCM)
  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Decodes any browser-supported compressed audio Blob (WebM, OGG, etc.) into linear PCM samples.
 */
export async function decodeAudioBlobToPcm(
  audioBlob: Blob,
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  if (typeof window === 'undefined' || !audioBlob || audioBlob.size === 0) return null;

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtxClass) return null;

  const decodeCtx = new AudioCtxClass();
  try {
    const arrayBuf = await audioBlob.arrayBuffer();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
    const samples = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    return { samples: new Float32Array(samples), sampleRate };
  } catch (err) {
    console.warn('[TwinVoice] decodeAudioBlobToPcm error:', err);
    return null;
  } finally {
    decodeCtx.close().catch(() => {});
  }
}

/**
 * Converts ArrayBuffer to Base64 in browser without external dependencies.
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

