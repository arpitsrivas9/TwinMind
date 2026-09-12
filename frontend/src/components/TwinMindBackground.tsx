"use client";

import { usePathname, useSearchParams } from "next/navigation";
import React, { Suspense, type ReactNode } from "react";
import { CognitiveBackground, type BackgroundIntensity } from "./CognitiveBackground";

import { PageTransition } from "./motion/PageTransition";

function BackgroundContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab")?.toLowerCase();

  let intensity: BackgroundIntensity = "medium";

  if (pathname === "/") {
    intensity = "strong";
  } else if (pathname === "/login" || pathname === "/signup") {
    intensity = "subtle";
  } else if (pathname === "/settings" || tab === "settings") {
    intensity = "quiet";
  } else if (pathname === "/profile" || tab === "profile") {
    intensity = "subtle";
  } else if (tab === "graph" || pathname === "/graph") {
    intensity = "strong";
  } else if (tab === "agents") {
    intensity = "strong";
  } else if (tab === "chat" || tab === "memory" || tab === "search" || pathname === "/dashboard") {
    intensity = "medium";
  }

  return (
    <div className="relative min-h-full">
      <CognitiveBackground intensity={intensity} />
      <div className="relative z-10">
        <PageTransition keyName={pathname || undefined}>
          {children}
        </PageTransition>
      </div>
    </div>
  );
}

export function TwinMindBackground({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-full">
          <CognitiveBackground intensity="medium" />
          <div className="relative z-10">{children}</div>
        </div>
      }
    >
      <BackgroundContent>{children}</BackgroundContent>
    </Suspense>
  );
}
