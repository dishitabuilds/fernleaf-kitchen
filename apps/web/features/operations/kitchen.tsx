'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PREP_STATUSES, type KitchenBoardResponse, type OperationalOrderResponse, type PrepUnitResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/features/auth/session-provider';
import { Pagination, textValue } from '@/features/configuration/common';
import { kitchenToday, OperationsConnection, OperationsFeedback, OperationsHeading, OperationsState, RiskLabel, stateLabel, timeLabel, useOperationsMutation, useOperationsResource } from './common';
import styles from './operations.module.css';
import { RoleDashboard } from '@/features/workspace/role-dashboard';

export function KitchenBoardScreen({ initialDate }: { initialDate?: string }) {
  const [filters, setFilters] = useState(() => ({ date: initialDate ?? kitchenToday(), stationId: '', status: '' }));
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ date: filters.date, page: String(page), pageSize: '50' });
  if (filters.stationId) query.set('stationId', filters.stationId);
  if (filters.status) query.set('status', filters.status);
  const resource = useOperationsResource<KitchenBoardResponse>(`/kitchen?${query}`);
  return <><OperationsHeading title="Kitchen workspace" description="Prepare confirmed meals one combination at a time. Station, choices and allergen guidance come from the recorded purchase." />
    <RoleDashboard key={filters.date} compact date={filters.date} />
    <div className={styles.toolbar}><Button variant="secondary" onClick={resource.refresh}>Refresh kitchen</Button><Button variant="ghost" onClick={() => { setFilters({ date: kitchenToday(), stationId: '', status: '' }); setPage(1); }}>Show kitchen today</Button></div>
    <Card className={styles.card}><h2>Find preparation work</h2><form aria-label="Filter kitchen work" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setFilters({ date: textValue(form, 'date'), stationId: textValue(form, 'stationId'), status: textValue(form, 'status') }); setPage(1); }}><div className="form-grid">
      <label className="form-field" htmlFor="kitchen-date">Delivery date<input id="kitchen-date" name="date" type="date" required value={filters.date} onChange={(event) => { setFilters((value) => ({ ...value, date: event.target.value })); setPage(1); }} /></label>
      <label className="form-field" htmlFor="kitchen-station"><span id="kitchen-station-label">Kitchen station</span><select id="kitchen-station" name="stationId" aria-labelledby="kitchen-station-label" value={filters.stationId} onChange={(event) => { setFilters((value) => ({ ...value, stationId: event.target.value })); setPage(1); }}><option value="">All stations</option>{filters.stationId && !resource.data?.stations.some((station) => station.id === filters.stationId) && <option value={filters.stationId}>Selected snapshot station</option>}{resource.data?.stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
      <label className="form-field" htmlFor="kitchen-status"><span id="kitchen-status-label">Preparation status</span><select id="kitchen-status" name="status" aria-labelledby="kitchen-status-label" value={filters.status} onChange={(event) => { setFilters((value) => ({ ...value, status: event.target.value })); setPage(1); }}><option value="">All preparation statuses</option>{PREP_STATUSES.map((status) => <option key={status} value={status}>{stateLabel(status)}</option>)}</select></label>
    </div><div className="form-actions"><Button>Apply kitchen filters</Button></div></form><p className={styles.muted}>Only active Confirmed orders are counted. One unique combination on an order line is one preparation unit. The board refreshes every 30 seconds while visible.</p>{resource.data && <p className={styles.muted}>At risk means unfinished work within {resource.data.riskThresholdMinutes} minutes of planned kitchen readiness; missing plans are labelled explicitly.</p>}</Card>
    <OperationsState loading={resource.loading} failure={resource.failure} refresh={resource.refresh} />
    {resource.data && <><p className={styles.muted}>{resource.data.total} preparation units match these delivery-date, station and status filters.</p><div className={styles.units}>{resource.data.items.map((unit) => <PrepUnitCard key={`${unit.id}-${unit.version}`} unit={unit} refresh={resource.refresh} />)}</div>{!resource.data.items.length && <Card className={styles.empty}>No confirmed preparation work matches these filters. Change the date or filters, or confirm a placed order through its passed cutoff.</Card>}<Pagination page={page} total={resource.data.total} pageSize={resource.data.pageSize} onPage={setPage} /></>}
    <OperationsConnection />
  </>;
}

export function PrepUnitCard({ unit, refresh }: { unit: PrepUnitResponse; refresh: () => void }) {
  const { session } = useSession();
  const command = useOperationsMutation();
  async function transition(action: 'start' | 'complete') {
    if (await command.send<PrepUnitResponse>(`/prep-units/${unit.id}/${action}`, { version: unit.version })) refresh();
  }
  return <article className={styles.unit} aria-label={`Preparation unit ${unit.id}`}><div className={styles.topline}><Link href={`/kitchen/orders/${unit.orderId}`}>Order #{unit.orderNumber}</Link><div className={styles.pills}><span className="status-pill">{stateLabel(unit.status)}</span><RiskLabel risk={unit.risk} /></div></div><h3>{unit.dish.name}</h3><p>{unit.quantity} meal(s) · {unit.station?.name ?? 'Unassigned station'} · {stateLabel(unit.dish.temperature)}</p><p>{unit.companyName} · {unit.employeeName}</p>
    <ul className={styles.choices}>{unit.selections.map((selection) => <li key={selection.groupId}>{selection.groupName}: {selection.optionName}{selection.portionName ? ` · ${selection.portionName}` : ''}</li>)}{!unit.selections.length && <li>No options selected</li>}</ul>
    {unit.allergyWarnings.length > 0 && <p className="allergy-warning">Allergen warning: {unit.allergyWarnings.join(', ')}</p>}<p className={styles.muted}>Recorded dish allergens: {unit.dish.allergens.map((value) => value.name).join(', ') || 'None recorded'} · Dietary tags: {unit.dish.dietaryTags.map((value) => value.name).join(', ') || 'None recorded'}</p>
    <dl className={styles.values}><div><dt>Planned kitchen ready</dt><dd>{timeLabel(unit.plannedKitchenReadyAt)}</dd></div><div><dt>Delivery</dt><dd>{timeLabel(unit.deliveryAt)}</dd></div><div><dt>Started</dt><dd>{timeLabel(unit.startedAt)}</dd></div><div><dt>Completed</dt><dd>{timeLabel(unit.doneAt)}</dd></div><div><dt>Packaging</dt><dd>{unit.packaging?.name ?? 'None recorded'}</dd></div></dl>
    <OperationsFeedback failure={command.failure} refresh={refresh} />
    <div className="form-actions">{unit.status === 'PENDING' && session?.permissions.includes('prep.start') && <Button type="button" variant="secondary" disabled={command.pending} onClick={() => void transition('start')}>Start prep</Button>}{unit.status !== 'DONE' && session?.permissions.includes('prep.complete') && <Button type="button" disabled={command.pending} onClick={() => void transition('complete')}>{command.pending ? 'Saving prep...' : 'Complete prep'}</Button>}</div>{unit.status === 'PENDING' && <p className={styles.muted}>Completing pending work records both its start and completion.</p>}
  </article>;
}

export function KitchenOrderScreen({ orderId }: { orderId: string }) {
  const resource = useOperationsResource<OperationalOrderResponse>(`/kitchen/orders/${orderId}`);
  const order = resource.data;
  return <><OperationsHeading title={order ? `Preparation for order #${order.number}` : 'Order preparation'} description="All recorded combinations must be complete before this order and its delivery group are ready." /><div className={styles.toolbar}><Link className="button button-secondary" href={order ? `/kitchen?date=${order.deliveryDate}` : '/kitchen'}>Back to kitchen</Link><Button variant="secondary" onClick={resource.refresh}>Refresh preparation</Button></div><OperationsState loading={resource.loading} failure={resource.failure} refresh={resource.refresh} />{order && <><Card className={styles.card}><h2>Order readiness</h2><div className={styles.pills}><span className="status-pill">{stateLabel(order.status)}</span><RiskLabel risk={order.kitchenRisk} /></div><p>{order.companyName} · {order.employee.name} · {order.quantity} meals</p><p>{order.prepUnits.filter((unit) => unit.status === 'DONE').length} of {order.prepUnits.length} combinations complete.</p><dl className={styles.values}><div><dt>Planned kitchen readiness</dt><dd>{timeLabel(order.plannedKitchenReadyAt)}</dd></div><div><dt>Actual first start</dt><dd>{timeLabel(order.kitchenStartedAt)}</dd></div><div><dt>Actual kitchen ready</dt><dd>{timeLabel(order.kitchenReadyAt)}</dd></div><div><dt>Delivery</dt><dd>{timeLabel(order.deliveryAt)}</dd></div></dl><p className={styles.muted}>Employee allergies: {order.employee.allergens.map((value) => value.name).join(', ') || 'None recorded'} · Preferences: {order.employee.dietaryTags.map((value) => value.name).join(', ') || 'None recorded'}.</p><ForceComplete order={order} refresh={resource.refresh} /></Card><div className={styles.units}>{order.prepUnits.map((unit) => <PrepUnitCard key={`${unit.id}-${unit.version}`} unit={unit} refresh={resource.refresh} />)}</div></>}</>;
}

function ForceComplete({ order, refresh }: { order: OperationalOrderResponse; refresh: () => void }) {
  const { session } = useSession();
  const command = useOperationsMutation();
  if (!session?.permissions.includes('prep.force-complete') || order.status !== 'CONFIRMED' || order.prepUnits.every((unit) => unit.status === 'DONE')) return null;
  async function submit(form: FormData) {
    if (await command.send<OperationalOrderResponse>(`/kitchen/orders/${order.id}/force-complete`, { version: order.version, reason: textValue(form, 'reason') })) refresh();
  }
  return <details className={styles.correction}><summary>Admin force completion</summary><p>Complete all remaining preparation units in one action, recording missing start/done times and a reason in the order timeline.</p><form aria-label="Force complete order" onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}><label className="form-field" htmlFor="force-reason">Force completion reason<textarea id="force-reason" name="reason" required maxLength={2000} rows={3} /></label><OperationsFeedback failure={command.failure} refresh={refresh} /><div className="form-actions"><Button disabled={command.pending}>{command.pending ? 'Completing order...' : 'Force complete order'}</Button></div></form></details>;
}
