/**
 * Type-safe, SSR-safe client-side storage utility for non-sensitive preferences.
 *
 * SECURITY POLICY:
 * - Only for UI preferences (theme, last-used model, collapse states).
 * - NEVER store API keys, passwords, credentials, or sensitive user secrets here.
 */

export const STORAGE_KEYS = {
  THEME: "twinmind_theme",
  LAST_MODEL: "twinmind_last_model",
  UI_PREFERENCES: "twinmind_ui_preferences",
  SIDEBAR_WIDTH: "twinmind_sidebar_width",
  PRIMARY_SIDEBAR_WIDTH: "twinmind_primary_sidebar_width",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS] | string;

export const safeStorage = {
  get<T>(key: StorageKey, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return fallback;
      return JSON.parse(item) as T;
    } catch {
      return fallback;
    }
  },

  getString(key: StorageKey, fallback: string = ""): string {
    if (typeof window === "undefined") return fallback;
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? item : fallback;
    } catch {
      return fallback;
    }
  },

  set<T>(key: StorageKey, value: T): boolean {
    if (typeof window === "undefined") return false;
    try {
      if (typeof value === "string") {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch {
      // Storage quota exceeded or disabled in private browsing
      return false;
    }
  },

  remove(key: StorageKey): boolean {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

