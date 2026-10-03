'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogueMenuItem, CompanyResponse, EmployeeMenuPreview, EmployeeResponse, MenuCategory, OrderDetail, OrderInput, OrderQuoteResponse, ReferenceValueResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { money, useChoiceResource, useResource } from '@/features/configuration/common';
import { ApiError, apiRequest } from '@/lib/http';
import { OrderDeliveryEditor } from './builder-delivery';
import { deliveryChoices, editableLines, orderLines, type EditableLine } from './builder-input';
import { OrderLinesEditor } from './builder-lines';
import { OrdersFeedback, OrdersHeading, OrdersLoadState, PurchaseBreakdown } from './common';
import { quoteFromError, useOrderMutation } from './mutation';
import styles from './orders.module.css';

// Direct secret previews are requested only when explicitly opened or already
// present on the saved order. Every request still runs employee menu rules.
async function loadMenu(path: string): Promise<EmployeeMenuPreview> {
  const [route, query = ''] = path.split('?');
  const categories = new URLSearchParams(query).get('direct')?.split(',').filter(Boolean) ?? [];
  const [ordinary, ...direct] = await Promise.all([apiRequest<EmployeeMenuPreview>(route), ...categories.map((id) => apiRequest<EmployeeMenuPreview>(`${route}/categories/${id}`))]);
  return { ...ordinary, categories: [...ordinary.categories, ...direct.flatMap((preview) => preview.categories)].filter((category, index, all) => all.findIndex((value) => value.id === category.id) === index),
    diagnostics: [...ordinary.diagnostics, ...direct.flatMap((preview) => preview.diagnostics)] };
}

export function OrderBuilderScreen({ orderId }: { orderId?: string }) {
  const resource = useResource<OrderDetail>(orderId ? `/orders/${orderId}` : null);
  if (orderId && !resource.data) return <><OrdersHeading title="Edit order" description="Load the saved order before changing its purchase." /><Link className="button button-secondary" href={`/orders/${orderId}`}>Back to order</Link><OrdersLoadState loading={resource.loading} failure={resource.failure} refresh={resource.refresh} /></>;
  if (resource.data && resource.data.status !== 'DRAFT' && resource.data.status !== 'PLACED') return <><OrdersHeading title={`Order #${resource.data.number} purchase is frozen`} description="Confirmed and terminal orders preserve their purchase. Use permitted logistics or cancellation actions on the detail page." /><Link className="button button-secondary" href={`/orders/${resource.data.id}`}>Back to order</Link></>;
  return <OrderEditor key={resource.data ? `${resource.data.id}-${resource.data.version}` : 'new'} initial={resource.data} onReload={resource.refresh} />;
}

function OrderEditor({ initial, onReload }: { initial: OrderDetail | null; onReload: () => void }) {
  const router = useRouter();
  const employees = useChoiceResource<EmployeeResponse>('/employees?page=1&pageSize=100');
  const categories = useChoiceResource<MenuCategory>('/categories?page=1&pageSize=100');
  const menuItems = useChoiceResource<CatalogueMenuItem>('/menu-items?page=1&pageSize=100');
  const packaging = useResource<ReferenceValueResponse[]>('/reference-data?kind=PACKAGING_TYPE');
  const [employeeId, setEmployeeId] = useState(initial?.input.employeeId ?? '');
  const [deliveryDate, setDeliveryDate] = useState(initial?.input.deliveryDate ?? '');
  const [delivery, setDelivery] = useState(() => deliveryChoices(initial?.input));
  const [lines, setLines] = useState<EditableLine[]>(() => editableLines(initial?.input.lines ?? []));
  const [dishId, setDishId] = useState('');
  const [directCategory, setDirectCategory] = useState('');
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [quote, setQuote] = useState<OrderQuoteResponse | null>(null);
  const [accepted, setAccepted] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [savedOrder, setSavedOrder] = useState(initial);
  // Save and place have independent action keys. A successful save is retained
  // if placement fails, so retry skips that save and uses its returned version.
  const checkpoint = useRef<{ signature: string; order: OrderDetail } | null>(initial ? { signature: JSON.stringify(initial.input), order: initial } : null);
  const saveMutation = useOrderMutation();
  const purchaseMutation = useOrderMutation();
  const quoteMutation = useOrderMutation();
  const employee = employees.data?.items.find((value) => value.id === employeeId) ?? null;
  const company = useResource<CompanyResponse>(employee ? `/companies/${employee.companyId}` : null);
  const directIds = new Set(directCategory ? [directCategory] : []);
  for (const line of lines) {
    const item = menuItems.data?.items.find((value) => value.id === line.menuItemId);
    if (item?.category.secret) directIds.add(item.categoryId);
  }
  const menu = useResource<EmployeeMenuPreview>(employeeId ? `/employees/${employeeId}/menu?direct=${[...directIds].sort().join(',')}` : null, loadMenu);
  const dishes = menu.data?.categories.flatMap((category) => category.dishes) ?? [];
  const savedException = Boolean(initial && override);
  const transferred = initial?.status === 'PLACED' && employee && employee.companyId !== initial.companyId;
  const loading = employees.loading || categories.loading || menuItems.loading || packaging.loading || company.loading || menu.loading;
  const configurationFailure = employees.failure ?? categories.failure ?? menuItems.failure ?? packaging.failure ?? company.failure ?? menu.failure;
  const purchaseReady = Boolean(quote?.lines.length && accepted === quote.fingerprint);
  const readonly = busy || savedException;
  const changedDefaults = !override && initial && employee && company.data ? [
    !employee.canChooseAddress && (initial.input.customAddress || (initial.input.addressId && initial.input.addressId !== company.data.defaultAddressId)) ? 'address' : null,
    !employee.canChangeTime && initial.input.deliveryTime && initial.input.deliveryTime !== company.data.deliveryTime ? 'time' : null,
    !employee.canChangePackaging && initial.input.packagingId !== undefined && initial.input.packagingId !== company.data.packagingId ? 'packaging' : null,
  ].filter(Boolean) : [];

  function clearReview() { setQuote(null); setAccepted(''); setFailure(null); }
  function changeLines(values: EditableLine[]) { setLines(values); clearReview(); }
  function selectOverride(value: boolean) {
    setOverride(value); clearReview();
    if (initial && savedOrder) {
      setEmployeeId(savedOrder.input.employeeId); setDeliveryDate(savedOrder.input.deliveryDate);
      setDelivery(deliveryChoices(savedOrder.input)); setLines(editableLines(savedOrder.input.lines));
    } else if (!value) setDelivery((current) => ({ ...current, custom: false }));
  }
  function input(): OrderInput {
    if (savedException && savedOrder) return savedOrder.input;
    if (!employeeId || !deliveryDate) throw new Error('Choose an employee and delivery date before saving or requesting a quote.');
    if (!employee || !company.data) throw new Error('Wait for the employee company and menu to finish loading.');
    const allowAddress = override || employee.canChooseAddress;
    const allowTime = override || employee.canChangeTime;
    const allowPackaging = override || employee.canChangePackaging;
    if (!override && delivery.custom && allowAddress) throw new Error('Choose an active saved company address for this ordinary purchase revision. Custom addresses require an explicit Admin exception.');
    return { employeeId, deliveryDate, lines: orderLines(lines),
      ...(override && delivery.custom ? { customAddress: { ...delivery.customAddress, line2: delivery.customAddress.line2 || null } } : allowAddress && delivery.addressId ? { addressId: delivery.addressId } : {}),
      ...(allowTime && delivery.deliveryTime ? { deliveryTime: delivery.deliveryTime } : {}),
      ...(allowPackaging && delivery.packaging ? { packagingId: delivery.packaging === 'none' ? null : delivery.packaging } : {}),
    };
  }
  function exceptionReason(): string {
    if (override && !reason.trim()) throw new Error('Enter an exception reason before requesting an Admin quote.');
    return reason.trim();
  }
  function receiveFailure(error: unknown) {
    setFailure(error);
    const replacement = quoteFromError(error);
    if (replacement) { setQuote(replacement); setAccepted(''); }
  }
  async function review() {
    setFailure(null); setAccepted(''); setQuote(null); setBusy(true);
    try {
      const body = { ...input(), ...(initial ? { orderId: initial.id } : {}), ...(override ? { overrideReason: exceptionReason() } : {}) };
      const result = await quoteMutation.send<OrderQuoteResponse>('/orders/quote', body, 'POST', false, receiveFailure);
      if (result) setQuote(result);
    } catch (error) { receiveFailure(error); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    setFailure(null); setBusy(true);
    try {
      const body = input();
      const result = savedOrder
        ? await saveMutation.send<OrderDetail>(`/orders/${savedOrder.id}`, { ...body, version: savedOrder.version }, 'PATCH', true, receiveFailure)
        : await saveMutation.send<OrderDetail>('/orders', { ...body, status: 'DRAFT' }, 'POST', true, receiveFailure);
      if (result) router.push(`/orders/${result.id}`);
    } catch (error) { receiveFailure(error); }
    finally { setBusy(false); }
  }
  async function purchase() {
    if (!quote || !purchaseReady) return;
    setFailure(null); setBusy(true);
    try {
      const body = input();
      let result: OrderDetail | undefined;
      if (!initial) {
        result = override
          ? await purchaseMutation.send<OrderDetail>('/orders/override-create', { ...body, acceptedQuote: quote.fingerprint, reason: exceptionReason() }, 'POST', true, receiveFailure)
          : await purchaseMutation.send<OrderDetail>('/orders', { ...body, status: 'PLACED', acceptedQuote: quote.fingerprint }, 'POST', true, receiveFailure);
      } else if (initial.status === 'PLACED') {
        result = await purchaseMutation.send<OrderDetail>(`/orders/${initial.id}`, { ...body, version: savedOrder!.version, acceptedQuote: quote.fingerprint }, 'PATCH', true, receiveFailure);
      } else if (override) {
        result = await purchaseMutation.send<OrderDetail>(`/orders/${initial.id}/override`, { action: 'PLACE', version: savedOrder!.version, acceptedQuote: quote.fingerprint, reason: exceptionReason() }, 'POST', true, receiveFailure);
      } else {
        const signature = JSON.stringify(body);
        let saved = checkpoint.current?.order ?? savedOrder!;
        if (checkpoint.current?.signature !== signature) {
          const updated = await saveMutation.send<OrderDetail>(`/orders/${initial.id}`, { ...body, version: saved.version }, 'PATCH', true, receiveFailure);
          if (!updated) return;
          saved = updated; checkpoint.current = { signature, order: updated }; setSavedOrder(updated);
        }
        result = await purchaseMutation.send<OrderDetail>(`/orders/${initial.id}/place`, { version: saved.version, acceptedQuote: quote.fingerprint }, 'POST', true, receiveFailure);
      }
      if (result) router.push(`/orders/${result.id}`);
    } catch (error) { receiveFailure(error); }
    finally { setBusy(false); }
  }
  function addDish() {
    const dish = dishes.find((value) => value.menuItemId === dishId);
    if (!dish) return;
    const duplicate = lines.some((line) => (menuItems.data?.items.find((value) => value.id === line.menuItemId)?.dishId ?? dishes.find((value) => value.menuItemId === line.menuItemId)?.dishId) === dish.dishId);
    if (duplicate) { setFailure(new Error('This dish already has a line. Add another combination to that line for a different option selection.')); return; }
    const quantity = String(dish.minQuantity ?? 1);
    changeLines([...lines, { key: crypto.randomUUID(), menuItemId: dish.menuItemId, quantity, combinations: [{ key: crypto.randomUUID(), quantity, selections: [] }] }]); setDishId('');
  }
  const usedDishes = new Set(lines.map((line) => menuItems.data?.items.find((value) => value.id === line.menuItemId)?.dishId));
  if (transferred) return <><OrdersHeading title="Placed purchase is preserved" description="This employee moved company. The recorded order remains attached to its original company and prices." /><div className={`${styles.notice} ${styles.warning}`}>Further purchase edits are blocked. Permitted delivery exceptions and cancellation remain available on the order detail.</div><Link className="button button-secondary" href={`/orders/${initial!.id}`}>Back to order</Link></>;

  return <><OrdersHeading title={initial ? `Edit order #${initial.number}` : 'Create order'} description="Choose employee meals and delivery, then review the kitchen service quote before accepting a purchase." />
    <div className={styles.toolbar}><Link className="button button-secondary" href={initial ? `/orders/${initial.id}` : '/orders'}>{initial ? 'Back to order' : 'Back to orders'}</Link>{initial && <Button variant="secondary" onClick={onReload} disabled={busy}>Reload saved order</Button>}</div>
    <OrdersFeedback failure={configurationFailure} />{loading && <p role="status">Loading employee, menu and delivery choices...</p>}
    <Card className={styles.card}><h2>Employee and delivery</h2><div className="form-grid">
      <label className="form-field" htmlFor="builder-employee"><span id="builder-employee-label">Employee</span><select id="builder-employee" aria-labelledby="builder-employee-label" aria-describedby="builder-employee-help" value={employeeId} disabled={readonly || initial?.status === 'PLACED'} onChange={(event) => { setEmployeeId(event.target.value); setDelivery(deliveryChoices()); setDirectCategory(''); setDishId(''); clearReview(); }}><option value="">Choose an active employee</option>{employees.data?.items.filter((value) => value.active || value.id === employeeId).map((value) => <option key={value.id} value={value.id} disabled={!value.active}>{value.name} · {value.email}{value.active ? '' : ' (inactive)'}</option>)}</select><span id="builder-employee-help" className="field-help">Placed orders keep their purchased employee. Changing a draft employee retains dish selections for review under the new company rules.</span></label>
      <label className="form-field" htmlFor="builder-date"><span id="builder-date-label">Delivery date</span><input id="builder-date" aria-labelledby="builder-date-label" aria-describedby="builder-date-help" type="date" value={deliveryDate} disabled={readonly} onChange={(event) => { setDeliveryDate(event.target.value); clearReview(); }} /><span id="builder-date-help" className="field-help">Local date in Asia/Kolkata; the company calendar and kitchen cutoff are validated by the server.</span></label>
    </div>
    {initial?.status !== 'PLACED' && <div className={styles.notice}><label className={styles.checkbox}><input type="checkbox" checked={override} disabled={busy} onChange={(event) => selectOverride(event.target.checked)} />Explicit Admin placement exception</label><p>{initial ? 'This exception places the saved draft and discards unsaved editor changes. To correct delivery first, use the Admin delivery exception on its detail page. Purchase edits past cutoff cannot be saved.' : 'Use a separate reasoned action for late placement, locked employee delivery choices or a custom address. A passed cutoff confirms the new purchase immediately; future dates remain Placed.'}</p>{override && <label className="form-field" htmlFor="builder-reason">Exception reason<textarea id="builder-reason" value={reason} disabled={busy} maxLength={2000} rows={3} onChange={(event) => { setReason(event.target.value); clearReview(); }} placeholder="Explain why this exception is needed." /></label>}</div>}
    <OrderDeliveryEditor choices={delivery} company={company.data} employee={employee} packaging={packaging.data ?? []} override={override} disabled={readonly} onChange={(value) => { setDelivery(value); clearReview(); }} />
    {changedDefaults.length > 0 && <p className="allergy-warning">Employee permissions now require the current company defaults for {changedDefaults.join(', ')}. This revision uses the defaults shown above; the earlier purchase stays recorded on the order detail.</p>}
    </Card>
    <Card className={styles.card}><h2>Meal selections</h2><p>Each dish appears once. Enter variants as combinations on that line. Options start unselected; allergy/preference warnings are guidance.</p>
      {!savedException && <><div className={styles.toolbar}><label className="form-field" htmlFor="builder-dish"><span id="builder-dish-label">Choose a dish</span><select id="builder-dish" aria-labelledby="builder-dish-label" value={dishId} disabled={busy || loading || !employeeId} onChange={(event) => setDishId(event.target.value)}><option value="">Choose a visible, priced dish</option>{menu.data?.categories.map((category) => <optgroup key={category.id} label={category.name}>{category.dishes.map((dish) => <option key={dish.menuItemId} value={dish.menuItemId} disabled={usedDishes.has(dish.dishId)}>{dish.name} · {money(dish.priceMinor)}{usedDishes.has(dish.dishId) ? ' · Already added' : ''}</option>)}</optgroup>)}</select></label><Button type="button" variant="secondary" disabled={!dishId || busy || loading} onClick={addDish}>Add dish</Button></div>
        {employeeId && categories.data?.items.some((value) => value.active && value.secret) && <details className={styles.revision}><summary>Secret category direct previews</summary><p>Direct previews apply the same company visibility and prices.</p><div className={styles.toolbar}>{categories.data.items.filter((category) => category.active && category.secret).map((category) => <Button key={category.id} variant="secondary" disabled={busy} onClick={() => { setDirectCategory(category.id); setDishId(''); }}>Preview {category.name}</Button>)}</div></details>}
      </>}
      <OrderLinesEditor lines={lines} dishes={dishes} previous={initial?.purchase} disabled={readonly} onChange={changeLines} />
      {menu.data && !menu.data.categories.some((category) => category.dishes.length) && <p className={styles.empty}>No visible, priced dishes are available for this employee. Review menu/pricing configuration or open a permitted secret category preview.</p>}
    </Card>
    <Card className={styles.card}><h2>Review and save</h2><p>The server quote shows the current purchase total, option prices, delivery information and cutoff. Changing any input clears the reviewed quote and acceptance.</p><OrdersFeedback failure={failure} />
      {failure instanceof ApiError && ['STALE_VERSION', 'CUTOFF_PASSED', 'EMPLOYEE_TRANSFERRED'].includes(failure.code) && <div className={`${styles.notice} ${styles.warning}`}><p>{failure.code === 'CUTOFF_PASSED' ? 'Choose a delivery date with a future cutoff. For an existing saved draft, its explicit Admin exception places the saved choices; unsaved purchase edits remain locked.' : 'Reload the saved order to review its current state before retrying. Your unsaved choices remain in this editor until you reload.'}</p>{initial && <Link href={`/orders/${initial.id}`}>Review saved order</Link>}</div>}
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy || loading || !employeeId || !deliveryDate || Boolean(configurationFailure)} onClick={() => void review()}>{busy && quoteMutation.pending ? 'Requesting quote...' : 'Review server quote'}</Button>{!override && initial?.status !== 'PLACED' && <Button type="button" variant="secondary" disabled={busy || loading || !employeeId || !deliveryDate || Boolean(configurationFailure)} onClick={() => void saveDraft()}>Save draft</Button>}</div>
      {quote && <div className={styles.quote} aria-label="Server quote"><PurchaseBreakdown quote={quote} recorded={false} /><label className={styles.checkbox}><input type="checkbox" checked={accepted === quote.fingerprint} disabled={busy || !quote.lines.length} onChange={(event) => setAccepted(event.target.checked ? quote.fingerprint : '')} />I accept this server quote</label></div>}
      <div className="form-actions"><Button type="button" disabled={busy || loading || !purchaseReady || Boolean(configurationFailure)} onClick={() => void purchase()}>{busy && !quoteMutation.pending ? 'Saving purchase...' : override ? 'Place with Admin exception' : initial?.status === 'PLACED' ? 'Save purchase revision' : 'Place order'}</Button></div>
    </Card>
  </>;
}
