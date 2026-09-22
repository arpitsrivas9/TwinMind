"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTrust } from '../../context/TrustContext';
import { Camera, X, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from './icons';

interface FaceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'verify' | 'enroll';
  onSuccess?: () => void;
}

type LivenessChallenge = 'TURN_LEFT' | 'TURN_RIGHT' | 'BLINK';

export function FaceVerificationModal({
  isOpen,
  onClose,
  mode,
  onSuccess,
}: FaceVerificationModalProps) {
  const {
    verifyIdentity,
    enrollFace,
    loading: trustLoading,
    setIsFaceEnrolling,
    setIsAuthenticating,
  } = useTrust();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<
    'initializing' | 'ready' | 'prompting' | 'capturing' | 'verifying' | 'enrolling' | 'success' | 'error'
  >('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lightingOk, setLightingOk] = useState<boolean | null>(null);
  const [challenge, setChallenge] = useState<LivenessChallenge>('TURN_LEFT');
  const [stepPrompt, setStepPrompt] = useState<string>('Align face inside the oval');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Synchronize authoritative SecurityState with modal lifecycle
  useEffect(() => {
    if (!isOpen) {
      setIsFaceEnrolling(false);
      setIsAuthenticating(false);
      return;
    }
    if (mode === 'enroll') {
      setIsFaceEnrolling(true);
    } else {
      setIsAuthenticating(true);
    }
    return () => {
      setIsFaceEnrolling(false);
      setIsAuthenticating(false);
    };
  }, [isOpen, mode, setIsFaceEnrolling, setIsAuthenticating]);

  // Stop camera stream safely and release hardware
  const stopCamera = useCallback(() => {
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
    }
  }, []);

  // Close handler with cleanup
  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Capture centered 32x32 grayscale luminance matrix as base64
  const captureGrayscaleMatrix = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (vw === 0 || vh === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Center crop to match the facial oval guide
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
      // ITU-R BT.601 luminance
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayBytes[i] = y;
      sum += y;
    }

    const avgLuma = sum / 1024;
    setLightingOk(avgLuma > 30);

    let binary = '';
    for (let i = 0; i < 1024; i++) {
      binary += String.fromCharCode(grayBytes[i]);
    }
    return btoa(binary);
  }, []);

  // Initialize webcam when modal opens
  useEffect(() => {
    let mounted = true;
    if (!isOpen) {
      stopCamera();
      return;
    }

    async function startCamera() {
      if (!mounted) return;

      setCameraState('initializing');
      setErrorMessage(null);
      setCountdown(null);
      setStepPrompt(mode === 'verify' ? 'Align face inside the oval' : 'Center face with neutral expression');

      // Pick dynamic challenge for verification
      const challenges: LivenessChallenge[] = ['TURN_LEFT', 'TURN_RIGHT', 'BLINK'];
      const selectedChallenge = challenges[Math.floor(Math.random() * challenges.length)];
      setChallenge(selectedChallenge);

      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported by this browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (!mounted) return;
            videoRef.current?.play().catch(() => {});
            setCameraState('ready');
          };
        }
      } catch (err: unknown) {
        if (!mounted) return;
        const e = err as Error;
        setCameraState('error');
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setErrorMessage('Camera permission was denied. Please allow camera access in your browser settings.');
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setErrorMessage('No camera device detected on your system.');
        } else {
          setErrorMessage(e.message || 'Unable to access local camera.');
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [isOpen, mode, stopCamera]);

  // Execute verification flow
  const handleStartVerification = async () => {
    setErrorMessage(null);
    setCameraState('prompting');

    // Step 1: Baseline neutral frame
    setStepPrompt('Step 1 of 2: Look directly at the camera');
    await new Promise((resolve) => setTimeout(resolve, 800));
    const frame1 = captureGrayscaleMatrix();
    if (!frame1) {
      setCameraState('error');
      setErrorMessage('Could not capture frame from camera.');
      return;
    }

    // Step 2: Liveness challenge prompt
    const challengeInstruction =
      challenge === 'TURN_LEFT'
        ? 'Step 2 of 2: Turn head slightly to the left'
        : challenge === 'TURN_RIGHT'
        ? 'Step 2 of 2: Turn head slightly to the right'
        : 'Step 2 of 2: Blink naturally';

    setStepPrompt(challengeInstruction);
    setCameraState('capturing');

    // Wait for movement
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const frame2 = captureGrayscaleMatrix();
    if (!frame2) {
      setCameraState('error');
      setErrorMessage('Could not capture challenge frame.');
      return;
    }

    setCameraState('verifying');
    setStepPrompt('Analyzing visual gradients & motion...');

    try {
      const ok = await verifyIdentity('FACE', {
        faceImageBase64: frame1,
        imageMatrixBase64: frame1,
        livenessFrames: [frame1, frame2],
        challenge,
      });

      if (ok) {
        setCameraState('success');
        setStepPrompt('Face & Liveness verified! Owner Mode active.');
        setTimeout(() => {
          handleClose();
          onSuccess?.();
        }, 1200);
      } else {
        setCameraState('error');
        setErrorMessage('Face verification failed or liveness challenge was rejected. Session remains protected.');
      }
    } catch {
      setCameraState('error');
      setErrorMessage('Verification request failed. Please check network connection.');
    }
  };

  // Execute multi-frame enrollment flow
  const handleStartEnrollment = async () => {
    setErrorMessage(null);
    setCameraState('prompting');
    setStepPrompt('Align face inside the oval guide and hold steady...');

    // 3 second countdown
    for (let c = 3; c > 0; c--) {
      setCountdown(c);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    setCountdown(null);

    setCameraState('capturing');
    const capturedFrames: string[] = [];
    const NUM_ENROLL_FRAMES = 4;

    for (let f = 0; f < NUM_ENROLL_FRAMES; f++) {
      setStepPrompt(`Capturing sample ${f + 1} of ${NUM_ENROLL_FRAMES}... hold steady`);
      const frame = captureGrayscaleMatrix();
      if (!frame) {
        setCameraState('error');
        setErrorMessage('Could not capture frame from camera stream. Please ensure camera is active.');
        return;
      }
      capturedFrames.push(frame);
      if (f < NUM_ENROLL_FRAMES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setCameraState('enrolling');
    setStepPrompt('Validating consensus and encrypting zero-knowledge facial template...');

    try {
      let ok = false;
      try {
        ok = await enrollFace(capturedFrames);
      } catch (enrollErr: unknown) {
        const e = enrollErr as Error;
        if (e.message?.includes('strong owner authentication')) {
          setStepPrompt('Owner authentication required. Verifying passkey...');
          const verified = await verifyIdentity('OS_AUTH');
          if (verified) {
            setStepPrompt('Owner identity confirmed! Encrypting facial template...');
            ok = await enrollFace(capturedFrames);
          } else {
            throw new Error('Owner authentication required. Please verify Windows Hello / Passkey to enroll face biometrics.');
          }
        } else {
          throw enrollErr;
        }
      }

      if (ok) {
        setCameraState('success');
        setStepPrompt('Owner face profile enrolled & verified! Switched to Owner Mode.');
        setTimeout(() => {
          handleClose();
          onSuccess?.();
        }, 1200);
      } else {
        setCameraState('error');
        setErrorMessage('Face enrollment failed. Ensure face is well-lit, centered, and steady.');
      }
    } catch (err: unknown) {
      setCameraState('error');
      const e = err as Error;
      setErrorMessage(e.message || 'Face enrollment error.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-6 text-slate-100 flex flex-col items-center">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Camera className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {mode === 'verify' ? 'TwinFace™ Visual Verification' : 'TwinFace™ Biometric Enrollment'}
          </h2>
        </div>
        <p className="text-xs text-slate-400 text-center mb-4 max-w-sm">
          {mode === 'verify'
            ? 'Align your face in the oval guide and follow the liveness movement prompt.'
            : 'Capture your zero-knowledge facial gradient template for local biometric recognition.'}
        </p>

        {/* Video Preview Container */}
        <div className="relative w-full aspect-[4/3] max-h-[300px] rounded-xl overflow-hidden bg-black border border-neutral-800 flex items-center justify-center shadow-inner">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {/* Oval Biometric Guide Overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`w-44 h-56 rounded-[50%] border-2 transition-colors duration-300 relative flex items-center justify-center ${
                cameraState === 'success'
                  ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_25px_rgba(52,211,153,0.3)]'
                  : cameraState === 'error'
                  ? 'border-rose-500 bg-rose-500/10'
                  : cameraState === 'verifying' || cameraState === 'capturing'
                  ? 'border-purple-400 animate-pulse bg-purple-500/5'
                  : 'border-cyan-400/70 border-dashed'
              }`}
            >
              {/* Scanning line animation during capture/verify */}
              {(cameraState === 'capturing' || cameraState === 'verifying') && (
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-[bounce_1.5s_infinite]" />
              )}

              {/* Countdown overlay */}
              {countdown !== null && (
                <span className="text-5xl font-black text-white drop-shadow-md animate-ping">
                  {countdown}
                </span>
              )}

              {/* Success Checkmark */}
              {cameraState === 'success' && (
                <CheckCircle2 className="w-16 h-16 text-emerald-400 drop-shadow-lg animate-in zoom-in-50" />
              )}
            </div>
          </div>

          {/* Initializing Spinner */}
          {cameraState === 'initializing' && (
            <div className="absolute inset-0 bg-neutral-900/90 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-slate-300">Accessing local camera feed...</p>
            </div>
          )}

          {/* Lighting Warning Tag */}
          {lightingOk === false && cameraState !== 'error' && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-950/85 border border-amber-800/80 rounded-lg px-2.5 py-1 flex items-center gap-1.5 text-[11px] text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Low lighting or contrast detected. Please illuminate your face.</span>
            </div>
          )}
        </div>

        {/* Step Prompt / Feedback Message */}
        <div className="w-full mt-3.5 p-2.5 rounded-xl bg-neutral-800/70 border border-neutral-750 text-center">
          <p
            className={`text-xs font-medium ${
              cameraState === 'success'
                ? 'text-emerald-400'
                : cameraState === 'error'
                ? 'text-rose-400'
                : 'text-slate-200'
            }`}
          >
            {errorMessage || stepPrompt}
          </p>
        </div>

        {/* Action Controls */}
        <div className="w-full mt-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            Cancel
          </button>

          {cameraState === 'error' ? (
            <button
              type="button"
              onClick={() => {
                setCameraState('ready');
                setErrorMessage(null);
                setStepPrompt('Align face inside the oval');
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-700 hover:bg-neutral-600 text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          ) : mode === 'verify' ? (
            <button
              type="button"
              onClick={handleStartVerification}
              disabled={cameraState !== 'ready' || trustLoading}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{cameraState === 'ready' ? 'Start Visual Verification' : 'Verifying...'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartEnrollment}
              disabled={cameraState !== 'ready' || trustLoading}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/25 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{cameraState === 'ready' ? 'Capture Face Template' : 'Enrolling...'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
