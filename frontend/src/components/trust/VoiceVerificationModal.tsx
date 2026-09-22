"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTrust, bufferToBase64 } from '../../context/TrustContext';
import { Mic, X, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from './icons';

interface VoiceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'verify' | 'enroll';
  onSuccess?: () => void;
}

type ModalState =
  | 'idle'
  | 'requesting_mic'
  | 'listening'
  | 'speech_detected'
  | 'segment_analyzing'
  | 'building_profile'
  | 'verifying_profile'
  | 'processing'
  | 'success'
  | 'error';

const MIN_REQUIRED_SPEECH_ENROLL_SEC = 4.5;
const TARGET_SEGMENTS_ENROLL = 3;
const MIN_REQUIRED_SPEECH_VERIFY_SEC = 2.0;

function writeAsciiString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWavBlob(chunks: Float32Array[], sampleRate: number): Blob {
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

export function VoiceVerificationModal({
  isOpen,
  onClose,
  mode,
  onSuccess,
}: VoiceVerificationModalProps) {
  const { verifyIdentity, enrollVoice, setIsVoiceEnrolling, voiceEnrolled, setIsAuthenticating } = useTrust();

  // Stable ref storage to break React render-cycle loops and avoid infinite effect restarts
  const onCloseRef = useRef(onClose);
  const onSuccessRef = useRef(onSuccess);
  const enrollVoiceRef = useRef(enrollVoice);
  const verifyIdentityRef = useRef(verifyIdentity);
  const setIsVoiceEnrollingRef = useRef(setIsVoiceEnrolling);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSuccessRef.current = onSuccess;
    enrollVoiceRef.current = enrollVoice;
    verifyIdentityRef.current = verifyIdentity;
    setIsVoiceEnrollingRef.current = setIsVoiceEnrolling;
  });

  // Synchronize authoritative SecurityState with modal lifecycle
  useEffect(() => {
    if (mode === 'enroll') {
      setIsVoiceEnrolling(true);
    } else {
      setIsAuthenticating(true);
    }
    return () => {
      setIsVoiceEnrolling(false);
      setIsAuthenticating(false);
    };
  }, [mode, setIsVoiceEnrolling, setIsAuthenticating]);

  const [modalState, setModalState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detectedSegmentsCount, setDetectedSegmentsCount] = useState<number>(0);
  const [usableSpeechSec, setUsableSpeechSec] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioMeterLevels, setAudioMeterLevels] = useState<number[]>(new Array(16).fill(0));

  // Live Development Diagnostics requested by user
  const [micStatus, setMicStatus] = useState<'IDLE' | 'REQUESTING' | 'ACTIVE' | 'ERROR'>('IDLE');
  const [trackStatus, setTrackStatus] = useState<string>('PENDING');
  const [liveRmsLevel, setLiveRmsLevel] = useState<number>(0);

  // Audio hardware references
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaRecorderChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const sampleRateRef = useRef<number>(16000);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionTokenRef = useRef<number>(0);
  const isFinalizingRef = useRef<boolean>(false);

  // Teardown hardware microphone and audio nodes cleanly without invalidating session token
  // ABSOLUTE SYSTEM AUDIO PROTECTION: Only cleans up TwinMind's own objects.
  // Never touches Windows master volume, never alters output device, never affects YouTube/Spotify.
  const releaseHardware = useCallback((options?: { keepDiagnostics?: boolean }) => {
    isFinalizingRef.current = false;
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Ignore
      }
      mediaRecorderRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Ignore
      }
      analyserRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      sourceRef.current = null;
    }
    if (typeof window !== 'undefined' && (window as unknown as { __twinVoiceSource?: unknown }).__twinVoiceSource) {
      delete (window as unknown as { __twinVoiceSource?: unknown }).__twinVoiceSource;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // Ignore
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
      streamRef.current = null;
    }
    setIsSpeaking(false);
    setAudioMeterLevels(new Array(16).fill(0));
    setLiveRmsLevel(0);
    if (!options?.keepDiagnostics) {
      setMicStatus('IDLE');
      setTrackStatus('CLOSED');
    }
    setIsVoiceEnrollingRef.current(false);
  }, []);

  // Cancel or abort the active session (used when user cancels, closes modal, or restarts)
  const cancelSession = useCallback(() => {
    sessionTokenRef.current++;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    releaseHardware();
    setMicStatus('IDLE');
    setTrackStatus('CLOSED');
  }, [releaseHardware]);

  const handleClose = useCallback(() => {
    cancelSession();
    onCloseRef.current?.();
  }, [cancelSession]);

  // Synchronous audio resume helper
  const ensureAudioResumed = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  // Main Recording Session Process
  const startSession = useCallback(async () => {
    cancelSession();
    const sessionToken = ++sessionTokenRef.current;
    isFinalizingRef.current = false;

    setModalState('requesting_mic');
    setMicStatus('REQUESTING');
    setTrackStatus('REQUESTING...');
    setErrorMessage(null);
    setSuccessMessage(null);
    mediaRecorderChunksRef.current = [];
    setUsableSpeechSec(0);
    setDetectedSegmentsCount(0);
    setElapsedSec(0);
    setIsSpeaking(false);
    setAudioMeterLevels(new Array(16).fill(0));
    setLiveRmsLevel(0);

    // Suppress continuous speaker verification & STT in chat during enrollment session
    setIsVoiceEnrollingRef.current(true);

    try {
      console.log('[TwinVoice] Requesting microphone access with standard constraints...');

      // 1. Request microphone permission with high quality standard audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (sessionToken !== sessionTokenRef.current) {
        console.warn('[TwinVoice] Session token changed during getUserMedia, terminating tracks');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        throw new Error('Microphone stream acquired but contains no active audio tracks.');
      }
      const track = audioTracks[0];
      track.enabled = true;

      // Monitor hardware track health continuously
      track.onended = () => {
        console.warn('[TwinVoice] Audio track ended unexpectedly');
        if (!isFinalizingRef.current && sessionToken === sessionTokenRef.current) {
          releaseHardware();
          setMicStatus('ERROR');
          setTrackStatus('ENDED');
          setModalState('error');
          setErrorMessage('Microphone disconnected or interrupted unexpectedly.');
        }
      };
      track.onmute = () => {
        if (!isFinalizingRef.current && sessionToken === sessionTokenRef.current) {
          setTrackStatus('MUTED');
        }
      };
      track.onunmute = () => {
        if (!isFinalizingRef.current && sessionToken === sessionTokenRef.current) {
          setTrackStatus('LIVE');
        }
      };

      console.log('[TwinVoice] Microphone track acquired successfully:', {
        label: track.label,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
      });

      streamRef.current = stream;
      setMicStatus('ACTIVE');
      setTrackStatus(track.readyState.toUpperCase());

      // 2. Engine 1: MediaRecorder (primary audio capture)
      if (typeof MediaRecorder !== 'undefined') {
        let preferredMime = '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          preferredMime = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          preferredMime = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          preferredMime = 'audio/mp4';
        }
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            mediaRecorderChunksRef.current.push(event.data);
          }
        };
        recorder.start(250);
      }

      // 3. Engine 2: AudioContext + AnalyserNode (real-time visualizer & live VAD)
      // ABSOLUTE REQUIREMENT: ZERO connection to audioCtx.destination!
      // AnalyserNode reads waveform and frequency bins directly from source without any speaker routing.
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch {
          // Will be resumed upon user click if blocked by browser policy
        }
      }
      audioContextRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      (window as unknown as { __twinVoiceSource?: MediaStreamAudioSourceNode }).__twinVoiceSource = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 4. Session Informational Elapsed Timer (Counts active seconds, does NOT abort)
      elapsedTimerRef.current = setInterval(() => {
        if (sessionToken !== sessionTokenRef.current) return;
        setElapsedSec((prev) => prev + 1);
      }, 1000);

      // Finalize Enrollment Handler (Triggered as soon as enough consistent data is gathered)
      const finalizeEnrollment = async () => {
        if (sessionToken !== sessionTokenRef.current) return;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        if (elapsedTimerRef.current) {
          clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }

        setModalState('building_profile');
        setTrackStatus('PROCESSING');

        const preferredMime = mediaRecorderRef.current?.mimeType || 'audio/webm';

        // Stop recorder to flush final chunks
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          await new Promise<void>((resolve) => {
            if (!mediaRecorderRef.current) return resolve();
            mediaRecorderRef.current.onstop = () => resolve();
            mediaRecorderRef.current.stop();
          });
        }

        if (sessionToken !== sessionTokenRef.current) return;

        // Release hardware cleanly now that recording is finished
        releaseHardware({ keepDiagnostics: true });
        setMicStatus('IDLE');
        setTrackStatus('CAPTURED');

        // Decode audio to linear PCM
        let pcmSamples: Float32Array | null = null;
        let decodedSampleRate = sampleRateRef.current;

        try {
          if (mediaRecorderChunksRef.current.length > 0) {
            const recordedBlob = new Blob(mediaRecorderChunksRef.current, {
              type: preferredMime,
            });
            const arrayBuf = await recordedBlob.arrayBuffer();
            const decodeCtx = new AudioCtxClass();
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
            pcmSamples = audioBuffer.getChannelData(0);
            decodedSampleRate = audioBuffer.sampleRate;
            decodeCtx.close().catch(() => {});
          }
        } catch (decodeErr) {
          console.warn('[TwinVoice] MediaRecorder decodeAudioData error:', decodeErr);
        }

        if (!pcmSamples || pcmSamples.length === 0) {
          setTrackStatus('ERROR');
          setModalState('error');
          setErrorMessage(
            'No audio was captured from your microphone. Please check your microphone settings and try again.',
          );
          return;
        }

        setModalState('verifying_profile');
        setTrackStatus('VERIFYING');
        const wavBlob = encodeWavBlob([pcmSamples], decodedSampleRate);

        try {
          // 15-second network timeout guard prevents indefinite UI stalls
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('Voice enrollment timed out. The server did not respond in time.')),
              15000,
            );
          });

          try {
            await Promise.race([enrollVoiceRef.current(wavBlob), timeoutPromise]);
          } catch (enrollErr: unknown) {
            const e = enrollErr as Error;
            if (e.message?.includes('strong owner authentication')) {
              setModalState('processing');
              setTrackStatus('AUTHENTICATING');
              const verified = await verifyIdentityRef.current('OS_AUTH');
              if (verified) {
                setModalState('verifying_profile');
                setTrackStatus('VERIFYING');
                await Promise.race([enrollVoiceRef.current(wavBlob), timeoutPromise]);
              } else {
                throw new Error('Owner authentication required. Please verify Windows Hello / Passkey to enroll voice biometrics.');
              }
            } else {
              throw enrollErr;
            }
          }

          if (sessionToken !== sessionTokenRef.current) return;

          setTrackStatus('VERIFIED');
          setModalState('success');
          setSuccessMessage(
            'Owner voice enrolled & verified successfully! Acoustic profile is now active.',
          );
          onSuccessRef.current?.();
          autoCloseTimerRef.current = setTimeout(() => {
            handleClose();
          }, 2200);
        } catch (err: unknown) {
          if (sessionToken !== sessionTokenRef.current) return;
          setTrackStatus('ERROR');
          const msg = err instanceof Error ? err.message : 'Failed to process voice enrollment.';
          setModalState('error');
          setErrorMessage(msg);
        }
      };

      // Finalize Verification Handler (Triggered after sufficient verification speech)
      const finalizeVerification = async () => {
        if (sessionToken !== sessionTokenRef.current) return;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        if (elapsedTimerRef.current) {
          clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }

        setModalState('processing');
        setTrackStatus('PROCESSING');

        const preferredMime = mediaRecorderRef.current?.mimeType || 'audio/webm';

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          await new Promise<void>((resolve) => {
            if (!mediaRecorderRef.current) return resolve();
            mediaRecorderRef.current.onstop = () => resolve();
            mediaRecorderRef.current.stop();
          });
        }

        if (sessionToken !== sessionTokenRef.current) return;

        // Release hardware cleanly now that recording is finished
        releaseHardware({ keepDiagnostics: true });
        setMicStatus('IDLE');
        setTrackStatus('CAPTURED');

        let pcmSamples: Float32Array | null = null;
        let decodedSampleRate = sampleRateRef.current;

        try {
          if (mediaRecorderChunksRef.current.length > 0) {
            const recordedBlob = new Blob(mediaRecorderChunksRef.current, {
              type: preferredMime,
            });
            const arrayBuf = await recordedBlob.arrayBuffer();
            const decodeCtx = new AudioCtxClass();
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
            pcmSamples = audioBuffer.getChannelData(0);
            decodedSampleRate = audioBuffer.sampleRate;
            decodeCtx.close().catch(() => {});
          }
        } catch (decodeErr) {
          console.warn('[TwinVoice] MediaRecorder decodeAudioData error:', decodeErr);
        }

        if (!pcmSamples || pcmSamples.length === 0) {
          setTrackStatus('ERROR');
          setModalState('error');
          setErrorMessage('No audio was captured from your microphone.');
          return;
        }

        const wavBlob = encodeWavBlob([pcmSamples], decodedSampleRate);
        setTrackStatus('VERIFYING');

        try {
          const arrayBuf = await wavBlob.arrayBuffer();
          const audioBase64 = bufferToBase64(arrayBuf);
          // 15-second network timeout guard
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('Voice verification timed out. The server did not respond in time.')),
              15000,
            );
          });
          const ok = await Promise.race([verifyIdentityRef.current('VOICE', { audioBase64 }), timeoutPromise]);
          if (sessionToken !== sessionTokenRef.current) return;

          if (ok) {
            setTrackStatus('VERIFIED');
            setModalState('success');
            setSuccessMessage('Owner identity verified! Switched to Owner Mode.');
            onSuccessRef.current?.();
            autoCloseTimerRef.current = setTimeout(() => {
              handleClose();
            }, 1800);
          } else {
            setTrackStatus('MISMATCH');
            setModalState('error');
            setErrorMessage(
              'Voice mismatch: Acoustic profile did not match the owner. TwinMind remains in Guest Mode.',
            );
          }
        } catch (err: unknown) {
          if (sessionToken !== sessionTokenRef.current) return;
          setTrackStatus('ERROR');
          const msg = err instanceof Error ? err.message : 'Failed to verify voice profile.';
          setModalState('error');
          setErrorMessage(msg);
        }
      };

      // Live Visualizer & Adaptive Multi-Segment VAD Loop (~25 FPS)
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);
      let lastMeterTimestamp = 0;
      let liveSpeechMs = 0;
      let currentSegmentSpeechMs = 0;
      let consecutiveSilenceMs = 0;
      let segmentsCount = 0;
      let liveNoiseFloor = 0.003;
      let lastFrameTime = performance.now();

      const updateMeter = (timestamp: number) => {
        if (sessionToken !== sessionTokenRef.current) return;
        const dt = Math.min(100, timestamp - lastFrameTime);
        lastFrameTime = timestamp;

        // Proactive stream and track health check while actively listening
        if (!isFinalizingRef.current) {
          if (!stream.active || track.readyState === 'ended') {
            console.warn('[TwinVoice] Microphone track became inactive during listening');
            releaseHardware();
            setMicStatus('ERROR');
            setTrackStatus('CLOSED (UNHEALTHY)');
            setModalState('error');
            setErrorMessage(
              'Microphone audio track was unexpectedly closed or disconnected. Please check your microphone and click Try Again.',
            );
            return;
          }
        }

        if (analyserRef.current) {
          if (timestamp - lastMeterTimestamp >= 40) {
            lastMeterTimestamp = timestamp;
            analyserRef.current.getByteFrequencyData(freqData);
            const bars: number[] = [];
            const step = Math.max(1, Math.floor(freqData.length / 16));
            for (let b = 0; b < 16; b++) {
              bars.push((freqData[b * step] || 0) / 255);
            }
            setAudioMeterLevels(bars);
          }

          // Live VAD tracking & level calculation
          analyserRef.current.getByteTimeDomainData(timeData);
          let sumSq = 0;
          for (let i = 0; i < timeData.length; i++) {
            const norm = (timeData[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const frameRms = Math.sqrt(sumSq / timeData.length);
          setLiveRmsLevel(frameRms);

          if (frameRms < liveNoiseFloor) {
            liveNoiseFloor = liveNoiseFloor * 0.95 + frameRms * 0.05;
          } else {
            liveNoiseFloor = liveNoiseFloor * 0.999 + frameRms * 0.001;
          }
          const dynamicThreshold = Math.max(0.005, Math.min(0.018, liveNoiseFloor * 2.0 + 0.003));
          const isCurrentlySpeaking = frameRms >= dynamicThreshold;
          setIsSpeaking(isCurrentlySpeaking);

          if (isCurrentlySpeaking) {
            liveSpeechMs += dt;
            currentSegmentSpeechMs += dt;
            consecutiveSilenceMs = 0;
            const currentSpeechSec = Number((liveSpeechMs / 1000).toFixed(1));
            setUsableSpeechSec((prev) => (prev !== currentSpeechSec ? currentSpeechSec : prev));
            setModalState((prev) => (prev === 'listening' || prev === 'segment_analyzing' ? 'speech_detected' : prev));
          } else {
            // Silence / pause tracking
            if (currentSegmentSpeechMs >= 750) {
              consecutiveSilenceMs += dt;
              if (consecutiveSilenceMs >= 350) {
                // Natural pause detected after valid speech utterance!
                if (!isFinalizingRef.current) {
                  segmentsCount++;
                  setDetectedSegmentsCount(Math.min(segmentsCount, TARGET_SEGMENTS_ENROLL));
                  currentSegmentSpeechMs = 0;
                  consecutiveSilenceMs = 0;
                  setModalState('segment_analyzing');
                }
              }
            }
          }

          // ADAPTIVE COMPLETION DETECTION
          if (mode === 'enroll' && !isFinalizingRef.current) {
            // Finish as soon as enough consistent speech data is accumulated:
            // Either >= 2 distinct segments with >= 4.5s speech, or >= 5.5s continuous speech
            if (
              (segmentsCount >= 2 && liveSpeechMs >= MIN_REQUIRED_SPEECH_ENROLL_SEC * 1000) ||
              (segmentsCount >= TARGET_SEGMENTS_ENROLL && liveSpeechMs >= 3500) ||
              liveSpeechMs >= 5500
            ) {
              isFinalizingRef.current = true;
              finalizeEnrollment();
              return;
            }
          } else if (mode === 'verify' && !isFinalizingRef.current) {
            // Verify mode: completes after 2.5s speech + pause, or 3.5s total speech
            if ((liveSpeechMs >= MIN_REQUIRED_SPEECH_VERIFY_SEC * 1000 && consecutiveSilenceMs >= 350) || liveSpeechMs >= 3500) {
              isFinalizingRef.current = true;
              finalizeVerification();
              return;
            }
          }
        }
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      animFrameRef.current = requestAnimationFrame(updateMeter);

      // Immediately enter listening state once mic is ready
      setModalState('listening');
    } catch (err: unknown) {
      cancelSession();
      setModalState('error');
      setMicStatus('ERROR');
      setTrackStatus('FAILED');
      const errObj = err as DOMException;
      console.error('[TwinVoice] Microphone getUserMedia failed:', errObj.name, errObj.message);

      if (errObj.name === 'NotAllowedError' || errObj.name === 'PermissionDeniedError') {
        setErrorMessage(
          'Microphone permission was denied. Please allow microphone access in your browser settings (chrome://settings/content/microphone) to proceed.',
        );
      } else if (errObj.name === 'NotFoundError' || errObj.name === 'DevicesNotFoundError') {
        setErrorMessage(
          'No microphone device was detected on your system. Please connect a microphone and try again.',
        );
      } else if (errObj.name === 'NotReadableError' || errObj.name === 'TrackStartError') {
        setErrorMessage(
          'Microphone is in use by another application or locked by Windows. Please close other audio apps and try again.',
        );
      } else if (errObj.name === 'OverconstrainedError') {
        setErrorMessage(
          'Audio hardware does not support the requested audio constraints. Please try again.',
        );
      } else {
        setErrorMessage(errObj.message || 'Could not access microphone hardware.');
      }
    }
  }, [mode, cancelSession, releaseHardware, handleClose]);

  // Start immediately when modal opens, and cleanly stop when closed
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    queueMicrotask(() => {
      if (active) {
        startSession();
      }
    });

    return () => {
      active = false;
      cancelSession();
    };
  }, [isOpen, startSession, cancelSession]);

  // Global unlock listeners while modal is open to ensure AudioContext stays awake
  useEffect(() => {
    if (!isOpen) return;
    const unlock = () => {
      ensureAudioResumed();
    };
    window.addEventListener('click', unlock, { capture: true });
    window.addEventListener('touchstart', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      window.removeEventListener('click', unlock, { capture: true });
      window.removeEventListener('touchstart', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [isOpen, ensureAudioResumed]);

  if (!isOpen) return null;

  const minRequiredSpeech = mode === 'enroll' ? MIN_REQUIRED_SPEECH_ENROLL_SEC : MIN_REQUIRED_SPEECH_VERIFY_SEC;
  const speechProgressPercent =
    mode === 'enroll'
      ? Math.min(100, Math.round((Math.min(detectedSegmentsCount / 3, 1) * 0.5 + Math.min(usableSpeechSec / minRequiredSpeech, 1) * 0.5) * 100))
      : Math.min(100, Math.round((usableSpeechSec / minRequiredSpeech) * 100));

  const isLiveActive =
    modalState === 'listening' ||
    modalState === 'speech_detected' ||
    modalState === 'segment_analyzing';

  return (
    <div
      onClick={ensureAudioResumed}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-6 text-slate-100 overflow-hidden">
        {/* Glow accent in top corner */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                {mode === 'enroll'
                  ? voiceEnrolled
                    ? 'Re-enroll Owner Voice'
                    : 'Owner Voice Enrollment'
                  : 'Verify Voice Biometric'}
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
                  {mode === 'enroll' ? 'Adaptive Biometric' : 'Verification'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'enroll'
                  ? 'Adaptive acoustic collection — speak naturally across 2-3 sentences'
                  : 'Speak naturally to verify your acoustic profile'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Diagnostics Bar */}
        <div className="mt-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800/80 text-[10px] font-mono">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                micStatus === 'ACTIVE'
                  ? 'bg-emerald-400 animate-pulse'
                  : micStatus === 'REQUESTING'
                  ? 'bg-amber-400 animate-pulse'
                  : micStatus === 'ERROR'
                  ? 'bg-rose-500'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-slate-400">MIC:</span>
            <strong
              className={
                micStatus === 'ACTIVE'
                  ? 'text-emerald-400'
                  : micStatus === 'REQUESTING'
                  ? 'text-amber-400'
                  : micStatus === 'ERROR'
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }
            >
              {micStatus}
            </strong>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">TRACK:</span>
            <strong
              className={
                trackStatus.includes('ERROR') ||
                trackStatus.includes('UNHEALTHY') ||
                trackStatus.includes('FAILED') ||
                trackStatus.includes('DISCONNECTED') ||
                trackStatus.includes('ENDED')
                  ? 'text-rose-400'
                  : 'text-cyan-300'
              }
            >
              {trackStatus}
            </strong>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">LEVEL:</span>
            <strong className="text-amber-300">
              {isLiveActive ? liveRmsLevel.toFixed(3) : '-'}
            </strong>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">VAD:</span>
            <strong
              className={
                isSpeaking
                  ? 'text-emerald-400 font-bold'
                  : isLiveActive
                  ? 'text-slate-500'
                  : modalState === 'building_profile' || modalState === 'verifying_profile' || modalState === 'processing'
                  ? 'text-cyan-400'
                  : 'text-slate-500'
              }
            >
              {isSpeaking
                ? 'SPEECH'
                : isLiveActive
                ? 'SILENCE'
                : modalState === 'building_profile' || modalState === 'verifying_profile' || modalState === 'processing'
                ? 'DONE'
                : 'OFF'}
            </strong>
          </div>
          {mode === 'enroll' && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400">SAMPLES:</span>
              <strong className="text-cyan-300">{Math.min(detectedSegmentsCount, 3)}/3</strong>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="my-4 space-y-4">
          {/* Adaptive Live State & Prompt Banner */}
          {isLiveActive && (
            <div className="space-y-3">
              {/* Dynamic status prompt */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isSpeaking
                        ? 'bg-emerald-400 animate-pulse'
                        : modalState === 'segment_analyzing'
                        ? 'bg-cyan-400 animate-pulse'
                        : 'bg-slate-500'
                    }`}
                  />
                  <h4 className="text-sm font-semibold text-slate-200">
                    {modalState === 'speech_detected'
                      ? 'Speech detected...'
                      : modalState === 'segment_analyzing'
                      ? 'Sample captured! Pause detected.'
                      : 'Listening for your voice...'}
                  </h4>
                </div>
                <p className="text-xs text-slate-400">
                  {mode === 'enroll'
                    ? detectedSegmentsCount === 0
                      ? 'Please speak 2-3 natural sentences about any topic with natural pauses.'
                      : detectedSegmentsCount === 1
                      ? 'First sample captured! Please continue with a second sentence.'
                      : detectedSegmentsCount === 2
                      ? 'Second sample captured! Speak one more short sentence to complete.'
                      : 'Finalizing speaker profile...'
                    : 'Speak naturally to verify your acoustic profile.'}
                </p>
              </div>

              {/* Sample Collection Pills (Enrollment Mode) */}
              {mode === 'enroll' && (
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3].map((sampleIdx) => {
                    const isCollected = detectedSegmentsCount >= sampleIdx;
                    const isCurrent = detectedSegmentsCount === sampleIdx - 1;
                    return (
                      <div
                        key={sampleIdx}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium transition-all ${
                          isCollected
                            ? 'bg-emerald-950/80 border border-emerald-600 text-emerald-300'
                            : isCurrent && isSpeaking
                            ? 'bg-cyan-950/80 border border-cyan-500 text-cyan-300 animate-pulse'
                            : 'bg-slate-800/60 border border-slate-700 text-slate-400'
                        }`}
                      >
                        <span>Sample {sampleIdx}</span>
                        <span>{isCollected ? '✓' : isCurrent && isSpeaking ? '●' : '○'}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Equalizer Spectrum Visualizer */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Microphone Spectrum</span>
                  <span>{isSpeaking ? 'RECORDING SPEECH' : 'LISTENING...'}</span>
                </div>
                <div className="flex items-end justify-between h-10 gap-1 px-1">
                  {audioMeterLevels.map((lvl, idx) => (
                    <div
                      key={idx}
                      className="flex-1 rounded-t transition-all duration-75"
                      style={{
                        height: `${Math.max(4, lvl * 100)}%`,
                        backgroundColor: isSpeaking
                          ? lvl > 0.6
                            ? '#34d399'
                            : '#22d3ee'
                          : '#475569',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Voice Data Quality Progress Bar */}
              <div className="space-y-1.5 p-3 rounded-xl bg-slate-800/40 border border-slate-750">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{mode === 'enroll' ? 'Voice Evidence Quality:' : 'Speech Validated:'}</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-cyan-300">
                    {usableSpeechSec.toFixed(1)}s / {minRequiredSpeech.toFixed(1)}s
                    {mode === 'enroll' && ` (${speechProgressPercent}%)`}
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-850 overflow-hidden border border-slate-700/60">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      speechProgressPercent >= 100
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                    }`}
                    style={{ width: `${speechProgressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span>Natural pauses supported (no timeout restart)</span>
                  <span className="font-mono text-slate-500">Session: {elapsedSec}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Requesting Mic State */}
          {modalState === 'requesting_mic' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-pulse">
                <Mic className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Requesting Microphone Access
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Connecting to your audio input device...
                </p>
              </div>
            </div>
          )}

          {/* Building Profile State */}
          {modalState === 'building_profile' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-spin">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Building Owner Acoustic Profile
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Analyzing speech segments and checking speaker consistency...
                </p>
              </div>
            </div>
          )}

          {/* Verifying Profile State */}
          {modalState === 'verifying_profile' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-pulse">
                <ShieldCheck className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Verifying Newly Created Profile
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Running internal self-verification pass against the acoustic template...
                </p>
              </div>
            </div>
          )}

          {/* Processing State (Verify Mode) */}
          {modalState === 'processing' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-spin">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Verifying Acoustic Identity
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Comparing speech acoustics against stored owner profile...
                </p>
              </div>
            </div>
          )}

          {/* Success State */}
          {modalState === 'success' && (
            <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-300">
                  {mode === 'enroll' ? 'Owner Voice Enrolled & Verified!' : 'Owner Verified!'}
                </h4>
                <p className="text-xs text-slate-300 max-w-xs mt-1">
                  {successMessage ||
                    'Acoustic biometric template encrypted and verified in Owner Mode.'}
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {modalState === 'error' && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-rose-300">Voice Enrollment Notice</h4>
                  <p className="text-xs text-rose-200 leading-relaxed">
                    {errorMessage || 'Voice biometric processing could not be completed.'}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-rose-800/40 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ensureAudioResumed();
                    startSession();
                  }}
                  className="py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        {isLiveActive && (
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="text-[11px] font-mono text-slate-400">
              {mode === 'enroll' ? 'Adaptive Session &bull; Speak naturally' : 'Verification Session'}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
