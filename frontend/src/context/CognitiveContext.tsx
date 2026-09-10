"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

export type CognitiveState =
  | "idle"
  | "thinking"
  | "streaming"
  | "searching"
  | "remembering"
  | "processing"
  | "agent-working"
  | "waiting"
  | "success"
  | "error";

interface CognitiveContextType {
  state: CognitiveState;
  setState: (state: CognitiveState) => void;
  pulseTrigger: number;
  triggerPulse: (state: CognitiveState, durationMs?: number) => void;
  activityLevel: number; // 0 (calm/idle) to 1 (high cognitive load)
  setIdle: () => void;
  startThinking: () => void;
  startStreaming: () => void;
  startSearching: () => void;
  startRemembering: () => void;
  startProcessing: () => void;
  startAgentWorking: () => void;
  triggerSuccess: () => void;
  triggerError: () => void;
}

const CognitiveContext = createContext<CognitiveContextType | undefined>(undefined);

export function CognitiveProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<CognitiveState>("idle");
  const [pulseTrigger, setPulseTrigger] = useState<number>(0);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const setState = useCallback((nextState: CognitiveState) => {
    clearTimer();
    setStateRaw(nextState);
    setPulseTrigger((prev) => prev + 1);
  }, []);

  const triggerPulse = useCallback(
    (pulseState: CognitiveState, durationMs: number = 1800) => {
      clearTimer();
      setStateRaw(pulseState);
      setPulseTrigger((prev) => prev + 1);

      resetTimerRef.current = setTimeout(() => {
        setStateRaw("idle");
      }, durationMs);
    },
    [],
  );

  const setIdle = useCallback(() => setState("idle"), [setState]);
  const startThinking = useCallback(() => setState("thinking"), [setState]);
  const startStreaming = useCallback(() => setState("streaming"), [setState]);
  const startSearching = useCallback(() => setState("searching"), [setState]);
  const startRemembering = useCallback(() => setState("remembering"), [setState]);
  const startProcessing = useCallback(() => setState("processing"), [setState]);
  const startAgentWorking = useCallback(() => setState("agent-working"), [setState]);

  const triggerSuccess = useCallback(() => {
    triggerPulse("success", 1600);
  }, [triggerPulse]);

  const triggerError = useCallback(() => {
    triggerPulse("error", 2200);
  }, [triggerPulse]);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  // Compute normalized activity level for background & particle systems
  const activityLevel =
    state === "idle"
      ? 0.15
      : state === "waiting"
      ? 0.25
      : state === "streaming"
      ? 0.75
      : state === "thinking"
      ? 0.85
      : state === "searching"
      ? 0.7
      : state === "remembering"
      ? 0.65
      : state === "agent-working"
      ? 0.9
      : state === "processing"
      ? 0.8
      : state === "success"
      ? 0.5
      : 0.6; // error

  return (
    <CognitiveContext.Provider
      value={{
        state,
        setState,
        pulseTrigger,
        triggerPulse,
        activityLevel,
        setIdle,
        startThinking,
        startStreaming,
        startSearching,
        startRemembering,
        startProcessing,
        startAgentWorking,
        triggerSuccess,
        triggerError,
      }}
    >
      {children}
    </CognitiveContext.Provider>
  );
}

export function useCognitiveActivity(): CognitiveContextType {
  const context = useContext(CognitiveContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      state: "idle",
      setState: () => {},
      pulseTrigger: 0,
      triggerPulse: () => {},
      activityLevel: 0.15,
      setIdle: () => {},
      startThinking: () => {},
      startStreaming: () => {},
      startSearching: () => {},
      startRemembering: () => {},
      startProcessing: () => {},
      startAgentWorking: () => {},
      triggerSuccess: () => {},
      triggerError: () => {},
    };
  }
  return context;
}

