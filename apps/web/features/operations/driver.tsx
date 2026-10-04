'use client';

import { useState } from 'react';
import { DROP_STATUSES, type DeliveryDropPage } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/features/configuration/common';
import { OperationsConnection, OperationsHeading, OperationsState, stateLabel, useOperationsResource } from './common';
import { DropCard } from './dispatch';
import styles from './operations.module.css';
import { RoleDashboard } from '@/features/workspace/role-dashboard';

export function DriverTodayScreen() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (status) query.set('status', status);
  // The authenticated driver and kitchen-local today are derived by the API.
  const resource = useOperationsResource<DeliveryDropPage>(`/driver/today?${query}`);
  return <><OperationsHeading title="Your delivery day" description="Your assigned stops for today in kitchen time, ordered by delivery time. Open a stop for its meals, contact and delivery action." />
    <RoleDashboard compact />
    <div className={styles.toolbar}><Button variant="secondary" onClick={resource.refresh}>Refresh my stops</Button><label className="form-field" htmlFor="driver-status"><span id="driver-status-label">My drop status</span><select id="driver-status" aria-labelledby="driver-status-label" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All my stops</option>{DROP_STATUSES.map((value) => <option key={value} value={value}>{stateLabel(value)}</option>)}</select></label></div>
    <OperationsState loading={resource.loading} failure={resource.failure} refresh={resource.refresh} />
    {resource.data && <><div className={styles.notice}><strong>{resource.data.date} · Asia/Kolkata</strong><p>{resource.data.total} assigned delivery groups match this status. Only your own kitchen-today stops appear; the page refreshes every 30 seconds while visible.</p><p>Stops are ordered by delivery time, then a stable group ID. Completed stops retain their actual time and the delivery target captured at departure.</p></div><div className={styles.dropList}>{resource.data.items.map((drop) => <DropCard key={drop.id} drop={drop} driver />)}</div>{!resource.data.items.length && <Card className={styles.empty}>No assigned stops match this status for today. Refresh after Dispatch assigns your work, or choose another status to see completed stops.</Card>}<Pagination page={page} total={resource.data.total} pageSize={resource.data.pageSize} onPage={setPage} /></>}
    <OperationsConnection />
  </>;
}
