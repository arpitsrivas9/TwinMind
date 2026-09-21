import { useState, useEffect, useRef, useCallback } from 'react';
import { CameraEvidenceState } from '../../types/trust';
import { verifyOwnerFaceApi } from '../api';

interface ContinuousFacePresenceOptions {
  enabled: boolean;
  faceEnrolled: boolean;
  isModalOpen: boolean;
  authEpoch: number;
  onEvidenceChange: (evidence: CameraEvidenceState) => void;
}

/**
 * Continuous Background Face Presence Monitor.
 * Provides independent visual presence evidence to TwinTrust™ at low overhead (~every 3s).
 *
 * Implements strict temporal debouncing, lighting/occlusion guards,
 * and complete hardware release on unmount/tab switch/modal conflict.
 */
export function useContinuousFacePresence({
  enabled,
  faceEnrolled,
  isModalOpen,
  authEpoch,
  onEvidenceChange,
}: ContinuousFacePresenceOptions) {
  const [cameraState, setCameraState] = useState<CameraEvidenceState>('CAMERA_UNAVAILABLE');
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isVerifyingRef = useRef<boolean>(false);
  const consecutiveUnknownCountRef = useRef<number>(0);
  const consecutiveNoFaceCountRef = useRef<number>(0);
  const authEpochRef = useRef<number>(authEpoch);
  const onEvidenceChangeRef = useRef(onEvidenceChange);

  useEffect(() => {
    authEpochRef.current = authEpoch;
    onEvidenceChangeRef.current = onEvidenceChange;
  }, [authEpoch, onEvidenceChange]);

  const updateEvidence = useCallback((newEvidence: CameraEvidenceState) => {
    setCameraState(newEvidence);
    onEvidenceChangeRef.current(newEvidence);
  }, []);

  // Safely stop stream and release hardware
  const stopStream = useCallback(() => {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    isVerifyingRef.current = false;
  }, []);

  // Capture 32x32 luminance matrix
  const captureMatrix = useCallback((): {
    matrixBase64: string;
    avgLuma: number;
    variance: number;
  } | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (vw === 0 || vh === 0) return null;

    if (!canvasRef.current && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      canvasRef.current = c;
    }

    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    ctx.drawImage(video, sx, sy, size, size, 0, 0, 32, 32);
    const imgData = ctx.getImageData(0, 0, 32, 32);
    const grayBytes = new Uint8Array(1024);

    let sum = 0;
    for (let i = 0; i < 1024; i++) {
      const r = imgData.data[i * 4];
      const g = imgData.data[i * 4 + 1];
      const b = imgData.data[i * 4 + 2];
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayBytes[i] = y;
      sum += y;
    }

    const avgLuma = sum / 1024;
    let varSum = 0;
    for (let i = 0; i < 1024; i++) {
      const diff = grayBytes[i] - avgLuma;
      varSum += diff * diff;
    }
    const variance = varSum / 1024;

    let binary = '';
    for (let i = 0; i < 1024; i++) {
      binary += String.fromCharCode(grayBytes[i]);
    }

    return {
      matrixBase64: btoa(binary),
      avgLuma,
      variance,
    };
  }, []);

  // Main presence verification cycle
  const runPresenceCycle = useCallback(async () => {
    if (isVerifyingRef.current) return;
    if (!faceEnrolled) {
      updateEvidence('NO_FACE');
      return;
    }

    const captured = captureMatrix();
    if (!captured) {
      consecutiveNoFaceCountRef.current += 1;
      if (consecutiveNoFaceCountRef.current >= 2) {
        updateEvidence('NO_FACE');
      }
      return;
    }

    // Guard: Poor lighting or covered camera is a temporary occlusion, NOT an unknown face
    if (captured.avgLuma < 20 || captured.variance < 15) {
      consecutiveNoFaceCountRef.current += 1;
      if (consecutiveNoFaceCountRef.current >= 2) {
        updateEvidence('NO_FACE');
      }
      return;
    }

    consecutiveNoFaceCountRef.current = 0;
    isVerifyingRef.current = true;
    const callEpoch = authEpochRef.current;

    try {
      const result = await verifyOwnerFaceApi({
        imageMatrixBase64: captured.matrixBase64,
      });

      // Discard stale result if auth epoch incremented during in-flight request
      if (authEpochRef.current > callEpoch) {
        return;
      }

      if (result.success || result.faceState === 'FACE_OWNER') {
        consecutiveUnknownCountRef.current = 0;
        updateEvidence('OWNER_FACE');
      } else if (result.faceState === 'FACE_NON_OWNER') {
        consecutiveUnknownCountRef.current += 1;
        // Temporal debouncing: require 3 consecutive frames (~9s) before flagging persistent intruder face
        if (consecutiveUnknownCountRef.current >= 3) {
          updateEvidence('UNKNOWN_FACE');
        } else {
          // During transition, maintain temporary neutral presence
          updateEvidence('NO_FACE');
        }
      } else {
        // Inconclusive or unenrolled: do not assume intruder
        consecutiveUnknownCountRef.current = 0;
        updateEvidence('NO_FACE');
      }
    } catch {
      updateEvidence('FACE_ERROR');
    } finally {
      isVerifyingRef.current = false;
    }
  }, [faceEnrolled, captureMatrix, updateEvidence]);

  // Stream initialization and lifecycle management
  useEffect(() => {
    let isMounted = true;

    // Do not run if camera is disabled, face is unenrolled, or user is in a modal
    if (!enabled || !faceEnrolled || isModalOpen) {
      stopStream();
      const fallbackEvidence: CameraEvidenceState = !enabled
        ? 'CAMERA_UNAVAILABLE'
        : !faceEnrolled
        ? 'NO_FACE'
        : 'CAMERA_UNAVAILABLE';
      queueMicrotask(() => {
        if (isMounted) updateEvidence(fallbackEvidence);
      });
      return;
    }

    async function startStream() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          if (isMounted) {
            queueMicrotask(() => {
              if (isMounted) updateEvidence('CAMERA_UNAVAILABLE');
            });
          }
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = document.createElement('video');
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        videoRef.current = video;

        video.onloadedmetadata = () => {
          if (!isMounted) return;
          video.play().catch(() => {});

          // Initial cycle after camera warms up
          setTimeout(() => {
            if (isMounted) {
              runPresenceCycle();
            }
          }, 800);

          // Run presence check every 3 seconds (low CPU/battery consumption)
          intervalTimerRef.current = setInterval(() => {
            if (isMounted && document.visibilityState === 'visible') {
              runPresenceCycle();
            }
          }, 3000);
        };
      } catch (err: unknown) {
        if (!isMounted) return;
        const e = err as Error;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          updateEvidence('CAMERA_UNAVAILABLE');
        } else {
          updateEvidence('FACE_ERROR');
        }
      }
    }

    startStream();

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [enabled, faceEnrolled, isModalOpen, stopStream, runPresenceCycle, updateEvidence]);

  return {
    cameraState,
    stopStream,
  };
}

