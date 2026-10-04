'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminDashboardResponse, KitchenDashboardResponse, DispatchDashboardResponse, DriverDashboardResponse, DashboardResponse } from '@fernleaf/contracts';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { apiRequest, errorMessage } from '@/lib/http';
import { useSession } from '@/features/auth/session-provider';

function formatMoney(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

function AdminDashboard({ data }: { data: AdminDashboardResponse }) {
  return <div className="dashboard-grid">
    <Card className="stat-card"><div className="stat-label">Committed orders today</div><div className="stat-value">{data.todayOrders}</div><div className="stat-detail">{data.todayMeals} meals · {data.draftCount} draft · {data.placedCount} placed</div></Card>
    <Card className="stat-card"><div className="stat-label">Uninvoiced value</div><div className="stat-value">{formatMoney(data.uninvoicedTotalMinor)}</div><Link href="/orders?invoiced=false&status=CONFIRMED" className="stat-link">View uninvoiced orders →</Link></Card>
    <Card className="stat-card"><div className="stat-label">Outstanding balance</div><div className="stat-value">{formatMoney(data.outstandingBalanceMinor)}</div>{data.companyCreditMinor > 0 && <div className="stat-detail">{formatMoney(data.companyCreditMinor)} company credit</div>}<Link href="/billing" className="stat-link">View invoices →</Link></Card>
    <div className="configuration-links">
      {[
        ['/orders', 'Manage orders', 'Quotes, recorded purchases and cutoff processing'],
        ['/kitchen', 'Kitchen board', 'Station work, readiness and preparation timing'],
        ['/dispatch', 'Dispatch', 'Driver assignment, departure and delivery history'],
        ['/billing', 'Billing', 'Invoices, payments and credits'],
        ['/staff', 'Staff', 'Manage staff accounts and roles'],
        ['/catalogue', 'Catalogue', 'Dishes, options and references'],
        ['/pricing', 'Pricing', 'Tier rules and bulk overrides'],
        ['/companies', 'Companies', 'Owners, calendars and delivery defaults'],
      ].map(([href, title, description]) => <Link className="card config-link" key={href} href={href}><h3>{title}</h3><p>{description}</p><Icon name="arrow" /></Link>)}
    </div>
  </div>;
}

function KitchenDashboard({ data }: { data: KitchenDashboardResponse }) {
  const totalRemaining = data.unitsByStation.reduce((s, st) => s + st.remaining, 0);
  return <div className="dashboard-grid">
    <Card className="stat-card"><div className="stat-label">Units remaining</div><div className="stat-value">{totalRemaining}</div></Card>
    <Card className="stat-card warning"><div className="stat-label">Late / At risk</div><div className="stat-value">{data.lateCount} late · {data.atRiskCount} at risk</div>{data.missingPlanCount > 0 && <div className="stat-detail">{data.missingPlanCount} missing plan</div>}</Card>
    {data.unitsByStation.map((st) => <Card key={st.stationId ?? 'none'} className="stat-card"><div className="stat-label">{st.stationName}</div><div className="stat-value">{st.remaining} / {st.total}</div><div className="stat-detail">remaining / total prep units</div></Card>)}
  </div>;
}

function DispatchDashboard({ data }: { data: DispatchDashboardResponse }) {
  return <div className="dashboard-grid">
    <Card className="stat-card"><div className="stat-label">Waiting for kitchen</div><div className="stat-value">{data.waiting}</div></Card>
    <Card className="stat-card"><div className="stat-label">Ready to dispatch</div><div className="stat-value">{data.ready}</div></Card>
    <Card className="stat-card warning"><div className="stat-label">Unassigned</div><div className="stat-value">{data.unassigned}</div></Card>
    <Card className="stat-card"><div className="stat-label">Travelling</div><div className="stat-value">{data.travelling}</div></Card>
    <Card className="stat-card success"><div className="stat-label">Delivered</div><div className="stat-value">{data.delivered}</div></Card>
  </div>;
}

function DriverDashboard({ data }: { data: DriverDashboardResponse }) {
  const onTimeRatio = data.completedDrops > 0 ? `${data.onTimeCount}/${data.completedDrops}` : 'N/A';
  return <div className="dashboard-grid">
    <Card className="stat-card"><div className="stat-label">My drops today</div><div className="stat-value">{data.totalDrops}</div><div className="stat-detail">{data.completedDrops} completed</div></Card>
    <Card className="stat-card"><div className="stat-label">On-time ratio</div><div className="stat-value">{onTimeRatio}</div><div className="stat-detail">{data.completedDrops === 0 ? 'No deliveries yet' : 'Among delivered drops'}</div></Card>
    {data.nextDrop && <Card className="stat-card accent"><div className="stat-label">Next stop</div><div className="stat-value">{data.nextDrop.companyName}</div><div className="stat-detail">{data.nextDrop.address}</div><Link href={`/today`} className="stat-link">Open route →</Link></Card>}
  </div>;
}

export function RoleDashboard() {
  const { session } = useSession();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<DashboardResponse>('/dashboard').then((result) => {
      if (active) { setData(result); setError(null); }
    }).catch((failure) => {
      if (active) setError(errorMessage(failure));
    }).finally(() => { if (active) setLoading(false); });
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      apiRequest<DashboardResponse>('/dashboard').then((result) => {
        if (active) { setData(result); setError(null); }
      }).catch(() => {});
    }, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (loading) return <div className="page-state" role="status"><span className="loading-ring" />Loading dashboard…</div>;
  if (error) return <div className="page-state" role="alert">{error}</div>;
  if (!data || !session) return null;

  const roleLabel = session.user.role === 'ADMIN' ? 'Operations overview' : session.user.role === 'KITCHEN' ? 'Kitchen workspace' : session.user.role === 'DISPATCH' ? 'Dispatch workspace' : 'Your delivery day';

  return <>
    <div className="page-heading"><div><div className="eyebrow">{session.user.role} DASHBOARD</div><h1>{roleLabel}</h1></div><span className="phase-badge">Phase 4</span></div>
    {data.role === 'ADMIN' && <AdminDashboard data={data.data} />}
    {data.role === 'KITCHEN' && <KitchenDashboard data={data.data} />}
    {data.role === 'DISPATCH' && <DispatchDashboard data={data.data} />}
    {data.role === 'DRIVER' && <DriverDashboard data={data.data} />}
  </>;
}
