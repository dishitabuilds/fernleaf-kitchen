'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@fernleaf/contracts';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest, errorMessage } from '@/lib/http';
import { roleDetails, type StaffRole } from '@/lib/roles';
import { useSession } from '@/features/auth/session-provider';

function ConnectionStatus() {
  const [state, setState] = useState<'loading' | 'connected' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<HealthResponse>('/health').then(() => {
      if (active) { setState('connected'); setError(null); }
    }).catch((failure: unknown) => {
      if (active) { setState('error'); setError(errorMessage(failure)); }
    });
    return () => { active = false; };
  }, [attempt]);

  return <Card className="connection-card"><div className={`connection-icon ${state}`}><Icon name={state === 'connected' ? 'check' : 'clock'} /></div><div><h3>{state === 'loading' ? 'Checking kitchen connection…' : state === 'connected' ? 'Kitchen service connected' : 'Kitchen service unavailable'}</h3><p>{state === 'connected' ? 'Your workspace can reach the service and its database.' : state === 'loading' ? 'Checking the service and database.' : error}</p></div>{state === 'error' && <Button variant="secondary" onClick={() => { setState('loading'); setAttempt((value) => value + 1); }}>Retry</Button>}</Card>;
}

export function FoundationOverview({ role }: { role: StaffRole }) {
  const { session } = useSession();
  const details = roleDetails[role];
  return <>
    <div className="page-heading"><div><div className="eyebrow">{details.label.toUpperCase()} WORKSPACE</div><h1>{details.title}</h1><p>{details.description}</p></div><span className="phase-badge">Phase 0</span></div>
    <Card className="welcome-card"><div className="welcome-copy"><div className="welcome-kicker"><Icon name="check" />STAFF ACCESS IS READY</div><h2>Hello, {session?.user.displayName ?? 'there'}.</h2><p>You are signed in with {roleDetails[session?.user.role ?? role].label.toLowerCase()} permissions. Your workspace is ready for the next stage of Fernleaf.</p></div><div className="welcome-leaf" aria-hidden="true"><Icon name={role === 'DRIVER' || role === 'DISPATCH' ? 'truck' : role === 'KITCHEN' ? 'utensils' : 'leaf'} /></div></Card>
    <div className="overview-grid"><Card className="planned-card"><div className="section-label">COMING NEXT <span>Phase {details.phase}</span></div><span className="empty-icon"><Icon name={role === 'DRIVER' || role === 'DISPATCH' ? 'truck' : role === 'KITCHEN' ? 'utensils' : 'grid'} /></span><h2>{details.next}</h2><p>{role === 'DRIVER' ? 'Today’s stops and delivery actions will appear here when the delivery workflow is implemented.' : 'Operational records and actions will appear here as the following phases are completed.'}</p><div className="planned-note">Planned · No operational data is shown in this foundation.</div></Card><Card className="access-card"><div className="section-label">YOUR ACCOUNT</div><dl><div><dt>Staff member</dt><dd>{session?.user.displayName}</dd></div><div><dt>Email</dt><dd>{session?.user.email}</dd></div><div><dt>Assigned role</dt><dd>{roleDetails[session?.user.role ?? role].label}</dd></div><div><dt>Workspace status</dt><dd><span className="status-dot" />Signed in</dd></div></dl><p className="access-note"><Icon name="lock" />Actions are checked against your permissions by the kitchen service.</p></Card></div>
    <ConnectionStatus />
  </>;
}
