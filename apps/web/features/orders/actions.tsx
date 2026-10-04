'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CompanyResponse, OrderDetail, OrderOverrideRequest, ReferenceValueResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { textValue, useResource } from '@/features/configuration/common';
import { OrdersFeedback } from './common';
import { useOrderMutation } from './mutation';
import styles from './orders.module.css';

type Action = 'cancel' | 'reject' | 'admin-cancel' | 'admin-reject' | 'delivery';
const titles: Record<Action, string> = { cancel: 'Cancel order', reject: 'Reject placed order', 'admin-cancel': 'Admin cancellation exception', 'admin-reject': 'Admin rejection exception', delivery: 'Admin delivery exception' };
export function OrderActions({ order, onChanged }: { order: OrderDetail; onChanged: () => void }) {
  const [selected, setSelected] = useState<Action | null>(null);
  const ordinary = order.status === 'DRAFT' || order.status === 'PLACED';
  const active = ordinary || order.status === 'CONFIRMED';
  const departed = order.drop?.status === 'OUT_FOR_DELIVERY' || order.drop?.status === 'DELIVERED';
  if (!active) return null;
  function choose(action: Action) { setSelected(action); }
  return <Card className={styles.card}><h2>Order actions</h2>{ordinary && <><p>Ordinary changes are available before the kitchen cutoff.</p><div className={styles.toolbar}><Button variant="secondary" onClick={() => choose('cancel')}>Cancel order</Button>{order.status === 'PLACED' && <Button variant="secondary" onClick={() => choose('reject')}>Reject order</Button>}</div></>}<div className={styles.notice}><strong>Admin exceptions</strong><p>Use an explicit exception for changes beyond ordinary permissions or cutoff. The reason is recorded in the progress timeline; recorded purchase amounts stay unchanged by delivery corrections.</p>{departed && <p>Packaging is locked after departure. Correct the address or time for the whole travelling group from its drop details.</p>}<div className={styles.toolbar}>{departed && order.drop ? <Link className="button button-secondary" href={`/dispatch/${order.drop.id}`}>Correct grouped delivery</Link> : <Button variant="secondary" onClick={() => choose('delivery')}>Override delivery</Button>}<Button variant="secondary" onClick={() => choose('admin-cancel')}>Override cancellation</Button>{order.status === 'PLACED' && <Button variant="secondary" onClick={() => choose('admin-reject')}>Override rejection</Button>}</div></div>{selected && <ActionForm key={`${selected}-${order.version}`} order={order} action={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); onChanged(); }} />}</Card>;
}
function ActionForm({ order, action, onClose, onChanged }: { order: OrderDetail; action: Action; onClose: () => void; onChanged: () => void }) {
  const mutation = useOrderMutation();
  const [custom, setCustom] = useState(!order.delivery.address.id);
  const [addressId, setAddressId] = useState(order.delivery.address.id ?? '');
  const [packagingId, setPackagingId] = useState(order.delivery.packaging?.id ?? '');
  const company = useResource<CompanyResponse>(action === 'delivery' ? `/companies/${order.companyId}` : null);
  const references = useResource<ReferenceValueResponse[]>(action === 'delivery' ? '/reference-data?kind=PACKAGING_TYPE' : null);
  async function submit(form: FormData) {
    const reason = textValue(form, 'reason');
    const common = { version: order.version, reason };
    if (action === 'delivery') {
      const delivery: Omit<OrderOverrideRequest, 'actionId'> = { ...common, action: 'DELIVERY', deliveryDate: textValue(form, 'deliveryDate'), deliveryTime: textValue(form, 'deliveryTime'), packagingId: packagingId || null,
        ...(custom ? { customAddress: { label: textValue(form, 'label'), line1: textValue(form, 'line1'), line2: textValue(form, 'line2') || null, city: textValue(form, 'city'), region: textValue(form, 'region'), postalCode: textValue(form, 'postalCode'), country: textValue(form, 'country') } } : { addressId }) };
      if (await mutation.send(`/orders/${order.id}/override`, delivery)) onChanged();
      return;
    }
    const override = action.startsWith('admin-');
    const target = action.endsWith('cancel') ? 'cancel' : 'reject';
    if (await mutation.send(`/orders/${order.id}/${override ? 'override' : target}`, override ? { ...common, action: target.toUpperCase() } : common)) onChanged();
  }
  return <form aria-label={titles[action]} className={styles.optionFields} onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}><h3>{titles[action]}</h3>{action === 'admin-cancel' && order.invoiced && <p>Cancellation keeps the issued invoice and purchase amount, and adds a full internal credit. Any recorded payment remains historical; a negative balance is company credit.</p>}{action === 'delivery' && <><p>The order stays attached to its recorded company even if the employee has moved.</p><OrdersFeedback failure={company.failure ?? references.failure} /><div className="form-grid"><label className="form-field" htmlFor="override-date">Delivery date<input id="override-date" name="deliveryDate" type="date" required defaultValue={order.delivery.deliveryDate} /></label><label className="form-field" htmlFor="override-time">Delivery time (IST)<input id="override-time" name="deliveryTime" type="time" required defaultValue={order.delivery.deliveryTime} /></label><label className="form-field" htmlFor="override-packaging"><span id="override-packaging-label">Packaging</span><select id="override-packaging" aria-labelledby="override-packaging-label" name="packagingId" value={packagingId} onChange={(event) => setPackagingId(event.target.value)}><option value="">No packaging</option>{packagingId && !references.data?.some((value) => value.id === packagingId && value.active) && <option value={packagingId}>{order.delivery.packaging?.name ?? 'Recorded packaging'} · Recorded / unavailable</option>}{references.data?.filter((value) => value.active).map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label className={styles.checkbox}><input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />Use a custom delivery address for this exception</label>{custom ? <>{(['label', 'line1', 'line2', 'city', 'region', 'postalCode', 'country'] as const).map((name) => <label key={name} className="form-field" htmlFor={`override-address-${name}`}>{({ label: 'Address label', line1: 'Street address', line2: 'Address line 2', city: 'City', region: 'State / region', postalCode: 'Postal code', country: 'Country' })[name]}<input id={`override-address-${name}`} name={name} required={name !== 'line2'} defaultValue={order.delivery.address[name] ?? ''} /></label>)}</> : <label className="form-field full" htmlFor="override-address"><span id="override-address-label">Recorded-company delivery address</span><select id="override-address" aria-labelledby="override-address-label" name="addressId" required value={addressId} onChange={(event) => setAddressId(event.target.value)}><option value="">Choose an active address</option>{addressId && !company.data?.addresses.some((address) => address.id === addressId && address.active) && <option value={addressId}>{order.delivery.address.label} · Recorded / unavailable</option>}{company.data?.addresses.filter((address) => address.active).map((address) => <option key={address.id} value={address.id}>{address.label} · {address.line1}</option>)}</select></label>}</div></>}<label className="form-field" htmlFor="order-action-reason">Reason<textarea id="order-action-reason" name="reason" required maxLength={2000} rows={3} placeholder="Explain this change for the order timeline." /></label><OrdersFeedback failure={mutation.failure} /><div className="form-actions"><Button disabled={mutation.pending || (action === 'delivery' && (company.loading || references.loading))}>{mutation.pending ? 'Saving...' : titles[action]}</Button><Button type="button" variant="secondary" onClick={onClose}>Close action</Button></div></form>;
}
