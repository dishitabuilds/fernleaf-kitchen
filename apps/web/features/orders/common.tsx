'use client';

import type { DeliveryPurchaseSnapshot, OrderQuoteResponse, OrderStatus } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AffectedOrderLinks, money } from '@/features/configuration/common';
import { ApiError, errorMessage } from '@/lib/http';
import styles from './orders.module.css';

export function orderStatusLabel(status: OrderStatus) { return status.charAt(0) + status.slice(1).toLowerCase(); }
export function instantLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + ' IST';
}
export function localDateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
}
export function OrdersHeading({ title, description }: { title: string; description: string }) {
  return <div className={styles.heading}><div><div className="eyebrow">COMPANY ORDERS</div><h1>{title}</h1><p>{description}</p></div><span className="phase-badge">Phase 2</span></div>;
}
export function StatusPill({ status }: { status: OrderStatus }) { return <span className={`status-pill ${status === 'CANCELLED' || status === 'REJECTED' ? 'warning' : ''}`}>{orderStatusLabel(status)}</span>; }
export function OrdersFeedback({ failure, notice }: { failure?: unknown; notice?: string }) {
  return <>{failure ? <div className="form-feedback error" role="alert"><p>{errorMessage(failure)}</p>{failure instanceof ApiError && failure.fieldErrors && <ul>{Object.entries(failure.fieldErrors).map(([field, messages]) => <li key={field}>{field}: {messages.join(' ')}</li>)}</ul>}<AffectedOrderLinks failure={failure} /></div> : null}{notice && <p className="form-feedback success" role="status">{notice}</p>}</>;
}
export function OrdersLoadState({ loading, failure, refresh }: { loading: boolean; failure: unknown; refresh: () => void }) {
  return <>{loading && <p role="status" className={styles.empty}>Loading orders...</p>}{failure ? <Card className={styles.empty}><OrdersFeedback failure={failure} /><Button variant="secondary" onClick={refresh}>Try again</Button></Card> : null}</>;
}
export function DeliverySummary({ delivery }: { delivery: DeliveryPurchaseSnapshot }) {
  const address = delivery.address;
  return <dl className={styles.values}><div><dt>Delivery</dt><dd>{localDateLabel(delivery.deliveryDate)} · {delivery.deliveryTime} IST</dd></div><div><dt>Packaging</dt><dd>{delivery.packaging?.name ?? 'Company default / none recorded'}</dd></div><div><dt>{address.label || 'Delivery address'}</dt><dd className={styles.address}>{[address.line1, address.line2, `${address.city}, ${address.region} ${address.postalCode}`, address.country].filter(Boolean).join('\n')}</dd></div><div><dt>Driver instructions</dt><dd>{delivery.driverInstructions || 'No instructions'}</dd></div><div><dt>Planned kitchen readiness</dt><dd>{instantLabel(delivery.plannedKitchenReadyAt)}</dd></div><div><dt>Planned dispatch readiness</dt><dd>{instantLabel(delivery.plannedDispatchReadyAt)}</dd></div></dl>;
}
export function PurchaseBreakdown({ quote, recorded = true }: { quote: OrderQuoteResponse; recorded?: boolean }) {
  return <div><dl className={styles.values}><div><dt>Employee</dt><dd>{quote.employee.name}<span className="cell-note">{quote.employee.email}</span></dd></div><div><dt>Company / tier</dt><dd>{quote.company.name} · {quote.tier.name}</dd></div><div><dt>Cutoff</dt><dd>{instantLabel(quote.cutoffAt)}</dd></div><div><dt>Allergy / preference guidance</dt><dd>{quote.employee.allergens.map((reference) => reference.name).join(', ') || 'No allergies recorded'}<span className="cell-note">{quote.employee.dietaryTags.map((reference) => reference.name).join(', ') || 'No dietary preferences recorded'}</span></dd></div></dl><DeliverySummary delivery={quote.delivery} />{quote.lines.map((line, lineIndex) => <section key={`${line.menuItemId}-${lineIndex}`} className={styles.line}><div className={styles.lineHeader}><div><h3>{line.dish.name}</h3><p className={styles.muted}>{line.dish.sku} · {line.quantity} meals · base {money(line.basePriceMinor)} per meal · {line.priceSource.toLowerCase()} price</p><p className={styles.muted}>{line.dish.temperature.toLowerCase()} · {line.dish.station?.name ?? 'Unassigned station'}</p></div><strong>{money(line.totalMinor)}</strong></div>{line.allergyWarnings.length > 0 && <p className="allergy-warning">Allergen warning: {line.allergyWarnings.join(', ')}</p>}<div className="table-scroll"><table><thead><tr><th>Combination</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{line.combinations.map((combination, index) => <tr key={combination.canonicalKey}><td><strong>Combination {index + 1}</strong><ul className={styles.selections}>{combination.selections.map((selection) => <li key={selection.groupId}>{selection.groupName}: {selection.optionName} · +{money(selection.priceMinor)} ({selection.priceSource.toLowerCase()})</li>)}{!combination.selections.length && <li>No options selected</li>}</ul></td><td>{combination.quantity}</td><td>{money(combination.unitPriceMinor)}</td><td>{money(combination.totalMinor)}</td></tr>)}</tbody></table></div></section>)}<div className={styles.total}><span>Order total · USD</span><strong>{money(quote.totalMinor)}</strong></div><p className={styles.muted}>{recorded ? 'This breakdown comes from the recorded purchase.' : 'Review this server quote before accepting the purchase.'} Tax and delivery fees are not charged.</p></div>;
}
