"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  getStoredUser,
  getAuthToken,
  clearAuthSession,
  loginUser,
  registerUser,
  fetchCurrentUser,
  devAutoLogin,
} from '../lib/api';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      const stored = getStoredUser();

      if (token && stored) {
        setUser(stored);
        try {
          const fresh = await fetchCurrentUser();
          setUser(fresh);
        } catch (err: unknown) {
          const is401 =
            err &&
            typeof err === 'object' &&
            'status' in err &&
            (err as { status?: number }).status === 401;

          if (is401) {
            clearAuthSession();
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('tm_auth_error', 'true');
            }
            setUser(null);
          }
          // On network error or server reconnect, retain stored user so UI does not loop
        }
      } else {
        const isDev = process.env.NODE_ENV === 'development';
        const explicitlyLoggedOut =
          typeof window !== 'undefined' &&
          (sessionStorage.getItem('tm_dev_logged_out') === 'true' ||
           sessionStorage.getItem('tm_auth_error') === 'true');
        const isOnAuthPage =
          typeof window !== 'undefined' &&
          (window.location.pathname.startsWith('/login') ||
           window.location.pathname.startsWith('/signup'));

        if (isDev && !explicitlyLoggedOut && !isOnAuthPage) {
          try {
            const devSession = await devAutoLogin();
            setUser(devSession.user);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (identifier: string, password: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tm_dev_logged_out');
      sessionStorage.removeItem('tm_auth_error');
    }
    const result = await loginUser(identifier, password);
    setUser(result.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tm_dev_logged_out');
      sessionStorage.removeItem('tm_auth_error');
    }
    const result = await registerUser(name, email, password);
    setUser(result.user);
  };

  const devLogin = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tm_dev_logged_out');
      sessionStorage.removeItem('tm_auth_error');
    }
    const result = await devAutoLogin();
    setUser(result.user);
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('tm_dev_logged_out', 'true');
      sessionStorage.removeItem('tm_auth_error');
    }
    clearAuthSession();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
