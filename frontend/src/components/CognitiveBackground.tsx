"use client";

import { useEffect, useRef } from "react";
import { useCognitiveActivity } from "../context/CognitiveContext";

export type BackgroundIntensity = "quiet" | "subtle" | "medium" | "strong";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  phase: number;
};

type BackgroundProfile = {
  particles: [number, number, number];
  glowOpacity: number;
  connectionOpacity: number;
  flowCount: number;
};

const MAX_PIXEL_RATIO = 2;
const PROFILES: Record<BackgroundIntensity, BackgroundProfile> = {
  quiet: { particles: [5, 8, 12], glowOpacity: 0.32, connectionOpacity: 0.28, flowCount: 0 },
  subtle: { particles: [7, 12, 18], glowOpacity: 0.5, connectionOpacity: 0.48, flowCount: 1 },
  medium: { particles: [9, 16, 25], glowOpacity: 0.76, connectionOpacity: 0.72, flowCount: 2 },
  strong: { particles: [12, 20, 32], glowOpacity: 1, connectionOpacity: 1, flowCount: 3 },
};

function createParticles(width: number, height: number, profile: BackgroundProfile): Particle[] {
  const density = width < 640 ? profile.particles[0] : width < 960 ? profile.particles[1] : profile.particles[2];

  return Array.from({ length: density }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.055,
    vy: (Math.random() - 0.5) * 0.055,
    radius: 0.7 + Math.random() * 1.35,
    opacity: 0.12 + Math.random() * 0.2,
    phase: Math.random() * Math.PI * 2,
  }));
}

export function CognitiveBackground({ intensity }: { intensity: BackgroundIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state: cognitiveState, activityLevel } = useCognitiveActivity();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const baseProfile = PROFILES[intensity];
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerQuery = window.matchMedia("(pointer: fine) and (min-width: 768px)");
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let animationFrame = 0;
    let lastTimestamp = 0;
    let isVisible = !document.hidden;
    let reducedMotion = motionQuery.matches;
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    // Dynamically adjust profile based on live cognitive activity
    const profile: BackgroundProfile = {
      ...baseProfile,
      glowOpacity: baseProfile.glowOpacity * (0.85 + activityLevel * 0.4),
      connectionOpacity: baseProfile.connectionOpacity * (0.85 + activityLevel * 0.35),
    };

    const draw = (timestamp: number, delta: number) => {
      context.clearRect(0, 0, width, height);

      const time = timestamp / 1000;
      const parallaxX = mouseX * 9;
      const parallaxY = mouseY * 7;
      const pulse = 0.5 + Math.sin(time * (0.22 + activityLevel * 0.3)) * 0.5;
      const glowX = width * (0.53 + Math.sin(time * 0.075) * 0.035) + parallaxX;
      const glowY = height * (0.37 + Math.cos(time * 0.06) * 0.045) + parallaxY;
      const glowRadius = Math.max(width, height) * (0.45 + activityLevel * 0.08);

      // Primary cognitive aura (Cyan / Mint)
      const primaryColor =
        cognitiveState === "remembering"
          ? "167, 139, 250"
          : cognitiveState === "agent-working"
          ? "52, 211, 153"
          : "34, 211, 238";

      const centerGlow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
      centerGlow.addColorStop(0, `rgba(${primaryColor}, ${(0.035 + pulse * 0.024) * profile.glowOpacity})`);
      centerGlow.addColorStop(0.55, `rgba(${primaryColor}, ${0.01 * profile.glowOpacity})`);
      centerGlow.addColorStop(1, `rgba(${primaryColor}, 0)`);
      context.fillStyle = centerGlow;
      context.fillRect(0, 0, width, height);

      // Secondary neural depth aura (Deep Violet)
      const edgeGlow = context.createRadialGradient(
        width * 0.17,
        height * 0.17,
        0,
        width * 0.17,
        height * 0.17,
        Math.max(width, height) * 0.34,
      );
      edgeGlow.addColorStop(0, `rgba(167, 139, 250, ${0.025 * profile.glowOpacity})`);
      edgeGlow.addColorStop(1, "rgba(167, 139, 250, 0)");
      context.fillStyle = edgeGlow;
      context.fillRect(0, 0, width, height);

      for (const particle of particles) {
        if (!reducedMotion) {
          const speedMultiplier = 1 + activityLevel * 0.5;
          particle.x += particle.vx * delta * speedMultiplier;
          particle.y += particle.vy * delta * speedMultiplier;
          if (particle.x < -8) particle.x = width + 8;
          if (particle.x > width + 8) particle.x = -8;
          if (particle.y < -8) particle.y = height + 8;
          if (particle.y > height + 8) particle.y = -8;
        }
      }

      const linkedPairs: Array<[Particle, Particle, number]> = [];
      const connectionDistance = width < 640 ? 135 : 190;

      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const dx = particles[first].x - particles[second].x;
          const dy = particles[first].y - particles[second].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < connectionDistance * connectionDistance) {
            linkedPairs.push([particles[first], particles[second], Math.sqrt(distSq)]);
          }
        }
      }

      // Render living neural links
      for (const [p1, p2, dist] of linkedPairs) {
        const linkAlpha = (1 - dist / connectionDistance) * 0.18 * profile.connectionOpacity;
        context.strokeStyle = `rgba(${primaryColor}, ${linkAlpha})`;
        context.lineWidth = 0.8;
        context.beginPath();
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.stroke();
      }

      // Render cognitive particle nodes
      for (const p of particles) {
        const pPulse = 0.8 + Math.sin(time * 2 + p.phase) * 0.25;
        context.fillStyle = `rgba(${primaryColor}, ${p.opacity * pPulse * (0.8 + activityLevel * 0.4)})`;
        context.beginPath();
        context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const animate = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = Math.min((timestamp - lastTimestamp) / 16.67, 2);
      lastTimestamp = timestamp;

      // Pointer smoothing
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      draw(timestamp, delta);
      if (isVisible && !reducedMotion) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.scale(pixelRatio, pixelRatio);
      particles = createParticles(width, height, profile);
      draw(performance.now(), 0);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerQuery.matches) return;
      targetMouseX = (event.clientX / window.innerWidth) * 2 - 1;
      targetMouseY = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible && !reducedMotion) {
        lastTimestamp = performance.now();
        animationFrame = requestAnimationFrame(animate);
      }
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      cancelAnimationFrame(animationFrame);
      mouseX = 0;
      mouseY = 0;
      targetMouseX = 0;
      targetMouseY = 0;
      draw(performance.now(), 0);
      if (!reducedMotion && isVisible) {
        lastTimestamp = performance.now();
        animationFrame = requestAnimationFrame(animate);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", handleMotionPreference);
    if (!reducedMotion && isVisible) animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener("change", handleMotionPreference);
    };
  }, [intensity, cognitiveState, activityLevel]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-screen w-screen" />;
}

