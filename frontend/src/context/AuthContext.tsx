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
} from '../lib/api';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
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
        } catch {
          // Token expired or invalid
          clearAuthSession();
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await loginUser(email, password);
    setUser(result.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    const result = await registerUser(name, email, password);
    setUser(result.user);
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
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
