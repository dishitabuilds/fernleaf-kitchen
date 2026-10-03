'use client';

import { useRef, useState } from 'react';
import type { OrderQuoteResponse } from '@fernleaf/contracts';
import { useSession } from '@/features/auth/session-provider';
import { ApiError, apiRequest } from '@/lib/http';

export function quoteFromError(error: unknown): OrderQuoteResponse | null {
  const value = error instanceof ApiError ? error.details?.quote : null;
  return typeof value === 'object' && value !== null && 'fingerprint' in value && typeof value.fingerprint === 'string' && 'lines' in value && Array.isArray(value.lines) ? value as OrderQuoteResponse : null;
}

export function useOrderMutation() {
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const lastAction = useRef<{ signature: string; id: string } | null>(null);
  async function send<T>(path: string, body: object, method = 'POST', withActionId = true, onFailure?: (error: unknown) => void): Promise<T | undefined> {
    const signature = JSON.stringify({ path, method, body });
    if (withActionId && lastAction.current?.signature !== signature) lastAction.current = { signature, id: crypto.randomUUID() };
    const payload = withActionId ? { ...body, actionId: lastAction.current!.id } : body;
    setPending(true); setFailure(null);
    try { return await apiRequest<T>(path, { method, headers: { 'x-csrf-token': session?.csrfToken ?? '' }, body: JSON.stringify(payload) }); }
    catch (error) { setFailure(error); onFailure?.(error); return undefined; }
    finally { setPending(false); }
  }
  return { send, pending, failure, clearFailure: () => setFailure(null) };
}
