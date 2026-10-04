'use client';

import Link from 'next/link';
import type { DropStatus, OrderDetail } from '@fernleaf/contracts';
import { Card } from '@/components/ui/card';
import { instantLabel } from './common';
import styles from './orders.module.css';

const dropLabels: Record<DropStatus, string> = {
  AWAITING_KITCHEN: 'Awaiting kitchen', KITCHEN_READY: 'Kitchen ready',
  DISPATCH_READY: 'Dispatch ready', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered',
};

export function OrderFulfilment({ order }: { order: OrderDetail }) {
  if (!order.confirmedAt) return null;
  const drop = order.drop;
  const outcome = !drop?.deliveredAt ? 'Not yet delivered'
    : drop.onTime === null ? 'Unknown: original delivery target is missing'
      : drop.onTime ? 'On time' : 'Late';
  return <Card className={styles.card}>
    <h2>Kitchen and delivery progress</h2>
    <dl className={styles.values}>
      <div><dt>Preparation units</dt><dd>{order.prepUnitCount} combinations · {order.quantity} meals</dd></div>
      <div><dt>Kitchen started</dt><dd>{instantLabel(order.kitchenStartedAt)}</dd></div>
      <div><dt>Kitchen ready</dt><dd>{instantLabel(order.kitchenReadyAt)}</dd></div>
      <div><dt>Drop progress</dt><dd>{drop ? dropLabels[drop.status] : 'No active drop membership'}</dd></div>
      <div><dt>Assigned driver</dt><dd>{drop?.driver?.name ?? 'Not assigned'}</dd></div>
      <div><dt>Last dispatch-ready timestamp</dt><dd>{instantLabel(drop?.dispatchReadyAt)}</dd></div>
      <div><dt>Departed</dt><dd>{instantLabel(drop?.departedAt)}</dd></div>
      <div><dt>Delivered</dt><dd>{instantLabel(order.deliveredAt)}</dd></div>
      <div><dt>Delivery target at departure</dt><dd>{instantLabel(drop?.targetAtDeparture)}</dd></div>
      <div><dt>Original delivery outcome</dt><dd>{outcome}</dd></div>
    </dl>
    <div className={styles.toolbar}>
      <Link className="button button-secondary" href={`/kitchen?date=${order.deliveryDate}`}>Open kitchen board</Link>
      {drop && <Link className="button button-secondary" href={`/dispatch/${drop.id}`}>Open grouped drop</Link>}
    </div>
    <p className={styles.muted}>Purchased amounts stay frozen. Readiness and delivery follow recorded preparation and drop transitions; later corrections preserve the original delivery outcome.</p>
  </Card>;
}
