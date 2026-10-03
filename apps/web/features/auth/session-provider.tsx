'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { SessionResponse } from '@fernleaf/contracts';
import { ApiError, apiRequest, errorMessage } from '@/lib/http';

type SessionContextValue = {
  session: SessionResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<SessionResponse>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadSession = useCallback(async () => {
    const request = ++requestVersion.current;
    try {
      const next = await apiRequest<SessionResponse>('/auth/me');
      if (request !== requestVersion.current) return;
      setSession(next);
      setError(null);
    } catch (failure) {
      if (request !== requestVersion.current) return;
      setSession(null);
      if (!(failure instanceof ApiError && failure.status === 401)) setError(errorMessage(failure));
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadSession();
  }, [loadSession]);

  useEffect(() => {
    let active = true;
    const request = ++requestVersion.current;
    apiRequest<SessionResponse>('/auth/me').then((next) => {
      if (active && request === requestVersion.current) { setSession(next); setError(null); }
    }).catch((failure: unknown) => {
      if (!active || request !== requestVersion.current) return;
      setSession(null);
      if (!(failure instanceof ApiError && failure.status === 401)) setError(errorMessage(failure));
    }).finally(() => { if (active && request === requestVersion.current) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Drop private client state as soon as any API request reports session expiry.
    const expired = () => { ++requestVersion.current; setSession(null); setLoading(false); };
    window.addEventListener('fernleaf:session-expired', expired);
    return () => window.removeEventListener('fernleaf:session-expired', expired);
  }, []);

  useEffect(() => {
    if (!session) return;
    // Recheck the current role/active flag on focus and the server's expiry time.
    const focus = () => { void refresh(); };
    const delay = Math.max(0, Math.min(Date.parse(session.expiresAt) - Date.now(), 2_147_483_647));
    const expiry = window.setTimeout(focus, delay);
    window.addEventListener('focus', focus);
    return () => { window.clearTimeout(expiry); window.removeEventListener('focus', focus); };
  }, [session, refresh]);

  async function signIn(email: string, password: string) {
    const request = ++requestVersion.current;
    const next = await apiRequest<SessionResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (request === requestVersion.current) { setSession(next); setError(null); }
    return next;
  }

  async function signOut() {
    if (!session) return;
    ++requestVersion.current;
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST', headers: { 'x-csrf-token': session.csrfToken } });
    } catch (failure) {
      // An expired session is already signed out; other failures must remain visible.
      if (!(failure instanceof ApiError && failure.status === 401)) throw failure;
    }
    ++requestVersion.current;
    setSession(null);
    setLoading(false);
  }

  return <SessionContext.Provider value={{ session, loading, error, refresh, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
