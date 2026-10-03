'use client';

import { useEffect, useState } from 'react';
import type { SettingsResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { apiRequest, errorMessage } from '@/lib/http';

export function SettingsShell() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<SettingsResponse>('/settings').then((result) => { if (active) { setSettings(result); setError(null); } }).catch((failure: unknown) => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; };
  }, [attempt]);

  return <>
    <div className="page-heading"><div><div className="eyebrow">KITCHEN CONFIGURATION</div><h1>Settings</h1><p>The shared foundations for every meal and delivery.</p></div><span className="phase-badge">Phase 0</span></div>
    <Card className="settings-card"><div className="settings-card-heading"><span className="empty-icon"><Icon name="settings" /></span><div><h2>Kitchen defaults</h2><p>Current values supplied by the kitchen service.</p></div><span className="readonly-label">Read only</span></div>
      {error ? <div className="settings-error"><p role="alert">{error}</p><Button variant="secondary" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Try again</Button></div> : !settings ? <p className="settings-loading" role="status">Loading kitchen defaults…</p> : <dl className="settings-values"><div><dt>Kitchen timezone<span>Used for delivery dates, cutoffs and today.</span></dt><dd>{settings.timezone}</dd></div><div><dt>Currency<span>All prices will use integer minor units.</span></dt><dd>{settings.currency}</dd></div></dl>}
      <div className="settings-planned"><Icon name="clock" /><p>Calendar, cutoff and reference-data editing are planned for Phase 1.</p></div>
    </Card>
  </>;
}
