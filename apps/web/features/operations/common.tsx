'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/features/auth/session-provider';
import { ApiError, apiRequest, errorMessage } from '@/lib/http';
import { useOrderMutation } from '@/features/orders/mutation';
import styles from './operations.module.css';

export function kitchenToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((part) => parts.find((value) => value.type === part)!.value).join('-');
}
export function timeLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + ' IST';
}
export function stateLabel(value: string): string { return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase()); }

// Keep the last coherent response visible during board polling. Old-path data
// never appears under new filters, and hidden tabs make no polling requests.
export function useOperationsResource<T>(path: string | null, intervalMs = 30000) {
  const [result, setResult] = useState<{ path: string; data: T | null; failure: unknown } | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    let active = true, pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await apiRequest<T>(path!);
        if (active) setResult({ path: path!, data, failure: null });
      } catch (failure) {
        if (active) setResult((previous) => ({ path: path!, data: previous?.path === path ? previous.data : null, failure }));
      } finally { pending = false; }
    }
    void load();
    const timer = setInterval(() => void load(), intervalMs);
    function becameVisible() { if (!document.hidden) void load(); }
    document.addEventListener('visibilitychange', becameVisible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', becameVisible); };
  }, [path, revision, intervalMs]);
  const current = result?.path === path ? result : null;
  return { data: current?.data ?? null, failure: current?.failure ?? null, loading: Boolean(path && !current), refresh };
}
export function useOperationsMutation() { return useOrderMutation(); }
export function OperationsHeading({ title, description }: { title: string; description: string }) {
  const { session } = useSession();
  return <div className={styles.heading}><div><div className="eyebrow">KITCHEN OPERATIONS</div><h1>{title}</h1><p>{description}</p><span className={styles.identity}>{session?.user.email}</span></div><span className="phase-badge">Phase 3</span></div>;
}
export function OperationsFeedback({ failure, refresh }: { failure: unknown; refresh?: () => void }) {
  if (!failure) return null;
  return <div className="form-feedback error" role="alert"><p>{errorMessage(failure)}</p>{failure instanceof ApiError && failure.fieldErrors && <ul>{Object.entries(failure.fieldErrors).map(([field, messages]) => <li key={field}>{field}: {messages.join(' ')}</li>)}</ul>}{failure instanceof ApiError && failure.status === 409 && <p>Another operation may have changed this record. Refresh and review its current state before retrying.</p>}{refresh && <Button type="button" variant="secondary" onClick={refresh}>Refresh current state</Button>}</div>;
}
export function OperationsState({ loading, failure, refresh }: { loading: boolean; failure: unknown; refresh: () => void }) {
  return <>{loading && <p role="status" className={styles.empty}>Loading operational records...</p>}<OperationsFeedback failure={failure} refresh={refresh} /></>;
}
export function OperationsConnection() {
  const resource = useOperationsResource<HealthResponse>('/health', 60000);
  return <Card className={styles.connection}><strong>{resource.loading ? 'Checking kitchen connection...' : resource.failure ? 'Kitchen service unavailable' : 'Kitchen service connected'}</strong><p>{resource.failure ? errorMessage(resource.failure) : 'Current records and actions are checked by the kitchen service.'}</p>{resource.failure ? <Button type="button" variant="secondary" onClick={resource.refresh}>Retry connection</Button> : null}</Card>;
}
export function RiskLabel({ risk }: { risk: string }) {
  return <span className={`${styles.risk} ${risk === 'LATE' ? styles.late : risk === 'AT_RISK' ? styles.atRisk : ''}`}>{risk === 'MISSING_PLAN' ? 'Missing planned time' : stateLabel(risk)}</span>;
}
