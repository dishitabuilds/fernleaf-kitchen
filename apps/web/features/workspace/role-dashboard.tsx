'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminDashboardResponse, KitchenDashboardResponse, DispatchDashboardResponse, DriverDashboardResponse, DashboardResponse } from '@fernleaf/contracts';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { apiRequest, errorMessage } from '@/lib/http';
import { useSession } from '@/features/auth/session-provider';
import { OperationsConnection } from '@/features/operations/common';

function formatMoney(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

function istInstant(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + ' IST';
}

function AdminDashboard({ data }: { data: AdminDashboardResponse }) {
  const dateQuery = `?date=${encodeURIComponent(data.date)}`;
  return <>
    <h2 className="dashboard-section-title">Demand for {data.date}</h2>
    <div className="dashboard-grid">
      <Card className="stat-card"><div className="stat-label">Committed orders today</div><div className="stat-value">{data.todayOrders}</div><div className="stat-detail">{data.todayMeals} meals · Confirmed + Delivered</div></Card>
      <Card className="stat-card"><div className="stat-label">Tentative orders</div><div className="stat-value">{data.draftCount + data.placedCount}</div><div className="stat-detail">{data.draftCount} draft · {data.placedCount} placed</div></Card>
      <Card className="stat-card"><div className="stat-label">Excluded orders</div><div className="stat-value">{data.cancelledCount + data.rejectedCount}</div><div className="stat-detail">{data.cancelledCount} cancelled · {data.rejectedCount} rejected</div></Card>
    </div>
    <h2 className="dashboard-section-title">Needs attention</h2>
    <div className="dashboard-grid">
      <Card className={`stat-card${data.kitchenLateUnits ? ' warning' : ''}`}><div className="stat-label">Kitchen late / at risk</div><div className="stat-value">{data.kitchenLateUnits} late · {data.kitchenAtRiskUnits} at risk</div><div className="stat-detail">{data.kitchenRemainingUnits} prep units remaining</div><Link href={`/kitchen${dateQuery}`} className="stat-link">Open kitchen board →</Link></Card>
      <Card className={`stat-card${data.unassignedDrops ? ' warning' : ''}`}><div className="stat-label">Drops without a driver</div><div className="stat-value">{data.unassignedDrops}</div><div className="stat-detail">Not yet departed</div><Link href={`/dispatch${dateQuery}`} className="stat-link">Open dispatch →</Link></Card>
      <Card className="stat-card"><div className="stat-label">Uninvoiced value · all dates</div><div className="stat-value">{formatMoney(data.uninvoicedTotalMinor)}</div><Link href="/orders?invoiced=false&billable=true" className="stat-link">View uninvoiced orders →</Link></Card>
      <Card className="stat-card"><div className="stat-label">Outstanding balance</div><div className="stat-value">{formatMoney(data.outstandingBalanceMinor)}</div>{data.companyCreditMinor > 0 && <div className="stat-detail">{formatMoney(data.companyCreditMinor)} company credit</div>}<Link href="/billing" className="stat-link">View invoices →</Link></Card>
    </div>
    <Card className="stat-card dashboard-table"><div className="stat-label">Next cutoffs with open orders</div>{data.upcomingCutoffs.length ? <div className="table-scroll"><table><thead><tr><th>Delivery date</th><th>Locks at</th><th>Draft (cancelled at cutoff)</th><th>Placed (confirmed at cutoff)</th></tr></thead><tbody>{data.upcomingCutoffs.map((row) => <tr key={row.deliveryDate}><td>{row.deliveryDate}</td><td>{istInstant(row.cutoffAt)}</td><td>{row.draftCount}</td><td>{row.placedCount}</td></tr>)}</tbody></table></div> : <p className="stat-detail">No Draft or Placed orders are waiting for a cutoff.</p>}</Card>
    <OperationsConnection />
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
  </>;
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
  const onTimeRatio = data.timedCompletedDrops > 0 ? `${data.onTimeCount}/${data.timedCompletedDrops}` : 'N/A';
  return <div className="dashboard-grid">
    <Card className="stat-card"><div className="stat-label">My drops today</div><div className="stat-value">{data.totalDrops}</div><div className="stat-detail">{data.completedDrops} completed</div></Card>
    <Card className="stat-card"><div className="stat-label">On-time ratio</div><div className="stat-value">{onTimeRatio}</div><div className="stat-detail">Among delivered drops with timing · {data.missingTimingCount} missing timing</div></Card>
    {data.nextDrop && <Card className="stat-card accent"><div className="stat-label">Next stop</div><div className="stat-value">{data.nextDrop.companyName}</div><div className="stat-detail">{data.nextDrop.address}</div><Link href={`/today`} className="stat-link">Open route →</Link></Card>}
  </div>;
}

export function RoleDashboard({ compact = false, date: fixedDate }: { compact?: boolean; date?: string }) {
  const { session } = useSession();
  const [chosenDate, setChosenDate] = useState<string | undefined>(undefined);
  const date = fixedDate ?? chosenDate;
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const path = `/dashboard${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    apiRequest<DashboardResponse>(path).then((result) => {
      if (active) { setData(result); setError(null); }
    }).catch((failure) => {
      if (active) setError(errorMessage(failure));
    }).finally(() => { if (active) setLoading(false); });
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      apiRequest<DashboardResponse>(path).then((result) => {
        if (active) { setData(result); setError(null); }
      }).catch((failure) => { if (active) setError(errorMessage(failure)); });
    }, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [date]);

  if (loading) return <div className="page-state" role="status"><span className="loading-ring" />Loading dashboard…</div>;
  if (error) return <div className="page-state" role="alert">{error}</div>;
  if (!data || !session) return null;

  const roleLabel = session.user.role === 'ADMIN' ? 'Operations overview' : session.user.role === 'KITCHEN' ? 'Kitchen workspace' : session.user.role === 'DISPATCH' ? 'Dispatch workspace' : 'Your delivery day';

  return <>
    {!compact && <div className="page-heading"><div><div className="eyebrow">{session.user.role} DASHBOARD</div><h1>{roleLabel}</h1><p className="stat-detail">Signed in as <span>{session.user.email}</span></p></div>{data.role === 'ADMIN' && <label className="form-field" htmlFor="dashboard-date">Delivery date (Asia/Kolkata)<input id="dashboard-date" type="date" value={data.data.date} onChange={(event) => { if (event.target.value) { setLoading(true); setChosenDate(event.target.value); } }} /></label>}</div>}
    {compact && <p>Role summary · {date ?? 'today'} · Asia/Kolkata</p>}
    {data.role === 'ADMIN' && <AdminDashboard data={data.data} />}
    {data.role === 'KITCHEN' && <KitchenDashboard data={data.data} />}
    {data.role === 'DISPATCH' && <DispatchDashboard data={data.data} />}
    {data.role === 'DRIVER' && <DriverDashboard data={data.data} />}
  </>;
}
