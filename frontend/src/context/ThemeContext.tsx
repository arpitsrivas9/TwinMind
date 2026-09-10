"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { safeStorage, STORAGE_KEYS } from "../lib/storage";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  if (resolved === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from storage
  useEffect(() => {
    const saved = safeStorage.getString(STORAGE_KEYS.THEME, "dark") as Theme;
    const validTheme: Theme = saved === "light" || saved === "system" ? saved : "dark";
    const initialResolved = validTheme === "system" ? getSystemTheme() : validTheme;
    applyThemeToDom(initialResolved);

    const timer = setTimeout(() => {
      setThemeState(validTheme);
      setResolvedTheme(initialResolved);
      setMounted(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    safeStorage.set(STORAGE_KEYS.THEME, nextTheme);

    const resolved = nextTheme === "system" ? getSystemTheme() : nextTheme;
    setResolvedTheme(resolved);
    applyThemeToDom(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (!mounted || theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const nextResolved = mediaQuery.matches ? "dark" : "light";
      setResolvedTheme(nextResolved);
      applyThemeToDom(nextResolved);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, mounted]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

