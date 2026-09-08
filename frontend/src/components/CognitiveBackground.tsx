"use client";

import { useEffect, useRef } from "react";

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

function connectionKey(first: number, second: number) {
  return (first * 17 + second * 31) % 11;
}

export function CognitiveBackground({ intensity }: { intensity: BackgroundIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const profile = PROFILES[intensity];
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

    const draw = (timestamp: number, delta: number) => {
      context.clearRect(0, 0, width, height);

      const time = timestamp / 1000;
      const parallaxX = mouseX * 9;
      const parallaxY = mouseY * 7;
      const pulse = 0.5 + Math.sin(time * 0.22) * 0.5;
      const glowX = width * (0.53 + Math.sin(time * 0.075) * 0.035) + parallaxX;
      const glowY = height * (0.37 + Math.cos(time * 0.06) * 0.045) + parallaxY;
      const glowRadius = Math.max(width, height) * 0.45;
      const centerGlow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
      centerGlow.addColorStop(0, `rgba(34, 211, 238, ${(0.035 + pulse * 0.022) * profile.glowOpacity})`);
      centerGlow.addColorStop(0.55, `rgba(34, 211, 238, ${0.009 * profile.glowOpacity})`);
      centerGlow.addColorStop(1, "rgba(34, 211, 238, 0)");
      context.fillStyle = centerGlow;
      context.fillRect(0, 0, width, height);

      const edgeGlow = context.createRadialGradient(width * 0.17, height * 0.17, 0, width * 0.17, height * 0.17, Math.max(width, height) * 0.34);
      edgeGlow.addColorStop(0, `rgba(167, 139, 250, ${0.025 * profile.glowOpacity})`);
      edgeGlow.addColorStop(1, "rgba(167, 139, 250, 0)");
      context.fillStyle = edgeGlow;
      context.fillRect(0, 0, width, height);

      for (const particle of particles) {
        if (!reducedMotion) {
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
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
          if (connectionKey(first, second) > 2) continue;
          const source = particles[first];
          const destination = particles[second];
          const distance = Math.hypot(source.x - destination.x, source.y - destination.y);
          if (distance > connectionDistance) continue;

          const visibility = 1 - distance / connectionDistance;
          const midpointX = (source.x + destination.x) / 2 + Math.sin(time * 0.14 + first) * 9;
          const midpointY = (source.y + destination.y) / 2 + Math.cos(time * 0.12 + second) * 7;
          context.beginPath();
          context.moveTo(source.x + parallaxX, source.y + parallaxY);
          context.quadraticCurveTo(midpointX + parallaxX, midpointY + parallaxY, destination.x + parallaxX, destination.y + parallaxY);
          context.strokeStyle = `rgba(103, 232, 249, ${visibility * 0.075 * profile.connectionOpacity})`;
          context.lineWidth = 0.55;
          context.stroke();
          linkedPairs.push([source, destination, linkedPairs.length]);
        }
      }

      linkedPairs.slice(0, width < 640 ? Math.min(profile.flowCount, 1) : profile.flowCount).forEach(([source, destination, index]) => {
        const progress = (time * 0.045 + index * 0.31) % 1;
        const controlX = (source.x + destination.x) / 2 + Math.sin(time * 0.14 + index) * 9;
        const controlY = (source.y + destination.y) / 2 + Math.cos(time * 0.12 + index) * 7;
        const inverseProgress = 1 - progress;
        const x = inverseProgress ** 2 * source.x + 2 * inverseProgress * progress * controlX + progress ** 2 * destination.x;
        const y = inverseProgress ** 2 * source.y + 2 * inverseProgress * progress * controlY + progress ** 2 * destination.y;
        context.beginPath();
        context.arc(x + parallaxX, y + parallaxY, 1.1, 0, Math.PI * 2);
        context.fillStyle = "rgba(165, 243, 252, 0.32)";
        context.fill();
      });

      for (const particle of particles) {
        const brightness = 0.72 + Math.sin(time * 0.48 + particle.phase) * 0.28;
        context.beginPath();
        context.arc(particle.x + parallaxX, particle.y + parallaxY, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(165, 243, 252, ${particle.opacity * brightness * profile.glowOpacity})`;
        context.fill();
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvas.width = Math.max(1, Math.floor(width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = createParticles(width, height, profile);
      draw(performance.now(), 0);
    };

    const animate = (timestamp: number) => {
      const delta = Math.min(timestamp - lastTimestamp, 32);
      lastTimestamp = timestamp;
      mouseX += (targetMouseX - mouseX) * 0.018;
      mouseY += (targetMouseY - mouseY) * 0.018;
      draw(timestamp, delta);
      if (isVisible && !reducedMotion) animationFrame = requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerQuery.matches || reducedMotion) return;
      targetMouseX = (event.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (event.clientY / window.innerHeight - 0.5) * 2;
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
  }, [intensity]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-screen w-screen" />;
}
