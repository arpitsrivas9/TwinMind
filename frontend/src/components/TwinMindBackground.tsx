"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CognitiveBackground, type BackgroundIntensity } from "./CognitiveBackground";
import { WorkspaceShell } from "./WorkspaceShell";

const intensityByPath: Record<string, BackgroundIntensity> = {
  "/": "strong",
  "/login": "subtle",
  "/signup": "subtle",
  "/dashboard": "medium",
  "/profile": "quiet",
  "/settings": "quiet",
};

const workspacePaths = new Set(["/dashboard", "/profile", "/settings"]);

export function TwinMindBackground({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const intensity = intensityByPath[pathname] ?? "quiet";

  return (
    <div className="relative min-h-full">
      <CognitiveBackground intensity={intensity} />
      <div className="relative z-10">
        {workspacePaths.has(pathname) ? <WorkspaceShell>{children}</WorkspaceShell> : children}
      </div>
    </div>
  );
}
