'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DROP_STATUSES, type DeliveryDropPage, type DeliveryDropResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination, textValue } from '@/features/configuration/common';
import { kitchenToday, OperationsConnection, OperationsHeading, OperationsState, RiskLabel, stateLabel, timeLabel, useOperationsResource } from './common';
import styles from './operations.module.css';
import { RoleDashboard } from '@/features/workspace/role-dashboard';

export function DispatchScreen({ initialDate }: { initialDate?: string }) {
  const [filters, setFilters] = useState(() => ({ date: initialDate ?? kitchenToday(), status: '' }));
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ date: filters.date, page: String(page), pageSize: '50' });
  if (filters.status) query.set('status', filters.status);
  const resource = useOperationsResource<DeliveryDropPage>(`/drops?${query}`);
  return <><OperationsHeading title="Dispatch workspace" description="Keep meals travelling together to the same company, physical address and delivery time. Each card is one delivery group." />
    <RoleDashboard key={filters.date} compact date={filters.date} />
    <div className={styles.toolbar}><Button variant="secondary" onClick={resource.refresh}>Refresh dispatch</Button><Button variant="ghost" onClick={() => { setFilters({ date: kitchenToday(), status: '' }); setPage(1); }}>Show dispatch today</Button></div>
    <Card className={styles.card}><h2>Find delivery groups</h2><form aria-label="Filter dispatch" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setFilters({ date: textValue(form, 'date'), status: textValue(form, 'status') }); setPage(1); }}><div className="form-grid">
      <label className="form-field" htmlFor="dispatch-date">Delivery date<input id="dispatch-date" name="date" type="date" required value={filters.date} onChange={(event) => { setFilters((value) => ({ ...value, date: event.target.value })); setPage(1); }} /></label>
      <label className="form-field" htmlFor="dispatch-status"><span id="dispatch-status-label">Drop status</span><select id="dispatch-status" name="status" aria-labelledby="dispatch-status-label" value={filters.status} onChange={(event) => { setFilters((value) => ({ ...value, status: event.target.value })); setPage(1); }}><option value="">All drop statuses</option>{DROP_STATUSES.map((status) => <option key={status} value={status}>{stateLabel(status)}</option>)}</select></label>
    </div><div className="form-actions"><Button>Apply dispatch filters</Button></div></form><p className={styles.muted}>Counts include active Confirmed members and historical Delivered members. Cancelled orders are detached. Lists refresh every 30 seconds while visible.</p></Card>
    <OperationsState loading={resource.loading} failure={resource.failure} refresh={resource.refresh} />
    {resource.data && <><p className={styles.muted}>{resource.data.total} delivery groups match the selected date and status.</p><div className={styles.dropList}>{resource.data.items.map((drop) => <DropCard key={drop.id} drop={drop} />)}</div>{!resource.data.items.length && <Card className={styles.empty}>No delivery groups match these filters. Confirmed orders create groups automatically; choose another delivery date or status to inspect existing work.</Card>}<Pagination page={page} total={resource.data.total} pageSize={resource.data.pageSize} onPage={setPage} /></>}
    <OperationsConnection />
  </>;
}

export function DropCard({ drop, driver = false }: { drop: DeliveryDropResponse; driver?: boolean }) {
  return <article className={styles.stop} aria-label={`Delivery group ${drop.id}`}><div className={styles.topline}><h2>{drop.companyName}</h2><span className="status-pill">{stateLabel(drop.status)}</span></div><p>{drop.orderCount} order(s) · {drop.quantity} meals · {timeLabel(drop.deliveryAt)}</p><p className={styles.address}>{[drop.address.line1, drop.address.line2, `${drop.address.city}, ${drop.address.region} ${drop.address.postalCode}`, drop.address.country].filter(Boolean).join('\n')}</p><p>Driver: {drop.driver?.name ?? 'Unassigned'}</p><div className={styles.pills}><span className={styles.muted}>Kitchen</span><RiskLabel risk={drop.kitchenRisk} /><span className={styles.muted}>Dispatch</span><RiskLabel risk={drop.dispatchRisk} /></div>{drop.status === 'DELIVERED' && <p>Delivered {timeLabel(drop.deliveredAt)} · {drop.onTime === null ? 'Timing outcome unknown' : drop.onTime ? 'On time' : 'Late delivery'}</p>}<Link className="button button-secondary" href={`${driver ? '/today' : '/dispatch'}/${drop.id}`}>{driver ? 'Open delivery stop' : 'Open delivery group'}</Link></article>;
}
