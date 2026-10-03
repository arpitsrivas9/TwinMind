'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (data: { pairingCode: string; sessionId?: string }) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannedResult, setScannedResult] = useState<string | null>(null);

  // Clean up media tracks explicitly
  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Decode frame using native BarcodeDetector or jsQR
  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let detectedRaw: string | null = null;

      // 1. Try native BarcodeDetector if supported
      if ('BarcodeDetector' in window) {
        try {
          // @ts-expect-error Native BarcodeDetector may not have full TS DOM types
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            detectedRaw = barcodes[0].rawValue;
          }
        } catch {
          // Fall back to jsQR
        }
      }

      // 2. Fall back to jsQR if native detector didn't find anything
      if (!detectedRaw) {
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code && code.data) {
            detectedRaw = code.data;
          }
        } catch {
          // Frame read error, continue next frame
        }
      }

      if (detectedRaw) {
        try {
          const parsed = JSON.parse(detectedRaw);
          if (parsed.twinmindPairing && (parsed.pairingCode || parsed.sessionId)) {
            setScannedResult(parsed.pairingCode || parsed.sessionId);
            stopCamera();
            onScanSuccess({
              pairingCode: parsed.pairingCode,
              sessionId: parsed.sessionId,
            });
            return;
          }
        } catch {
          // If raw is just a 6 digit code
          if (/^\d{6}$/.test(detectedRaw.trim())) {
            const code = detectedRaw.trim();
            setScannedResult(code);
            stopCamera();
            onScanSuccess({ pairingCode: code });
            return;
          }
        }
      }
    }

    animationFrameId.current = requestAnimationFrame(scanFrame);
  }, [isScanning, onScanSuccess, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setCameraError(null);
    setScannedResult(null);

    let active = true;

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (active) {
          setCameraError('Camera access is not supported by your browser environment.');
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setIsScanning(true);
        }
      } catch (err) {
        if (active) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Could not access camera. Please check browser permissions.';
          setCameraError(msg);
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  useEffect(() => {
    if (isScanning) {
      animationFrameId.current = requestAnimationFrame(scanFrame);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isScanning, scanFrame]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-6 shadow-2xl shadow-cyan-500/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="flex h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-base font-semibold text-white tracking-wide">
              Scan Hardware Pairing QR
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Close scanner"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Viewfinder / Video Canvas */}
        <div className="relative mt-4 flex flex-col items-center justify-center">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-rose-950/20 border border-rose-500/30 rounded-xl w-full">
              <svg className="w-10 h-10 text-rose-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-medium text-rose-300 mb-1">Camera Unavailable</p>
              <p className="text-xs text-rose-200/70 max-w-xs">{cameraError}</p>
              <p className="text-xs text-slate-400 mt-4">
                You can still pair manually by typing the 6-digit PIN shown on the Host Laptop.
              </p>
            </div>
          ) : scannedResult ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-emerald-950/20 border border-emerald-500/30 rounded-xl w-full">
              <svg className="w-10 h-10 text-emerald-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-semibold text-emerald-300">Pairing Code Detected!</p>
              <p className="text-xs font-mono text-emerald-400 mt-1">{scannedResult}</p>
            </div>
          ) : (
            <div className="relative w-full aspect-square max-h-72 bg-black rounded-xl overflow-hidden border border-cyan-500/40 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Target Reticle */}
              <div className="absolute inset-8 border-2 border-cyan-400/50 rounded-lg pointer-events-none flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
                </div>
                {/* Scanning sweep line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse" />
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-cyan-400" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400">
            Align the QR code from your Host Laptop within the frame to connect automatically.
          </p>
          <button
            onClick={handleClose}
            className="mt-3 w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

