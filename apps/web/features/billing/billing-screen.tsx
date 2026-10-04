'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { InvoicePage, InvoiceSummary, InvoiceDetail, UninvoicedOrderSummary, PageResponse } from '@fernleaf/contracts';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest, errorMessage } from '@/lib/http';
import { useSession } from '@/features/auth/session-provider';

function formatMoney(minor: number): string { return `$${(minor / 100).toFixed(2)}`; }
type PendingAction = { key: string; id: string } | null;
function actionId(pending: { current: PendingAction }, payload: object): string {
  const key = JSON.stringify(payload);
  if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
  return pending.current.id;
}
function parseMoney(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, cents = ''] = value.trim().split('.');
  const amount = BigInt(whole) * BigInt(100) + BigInt(cents.padEnd(2, '0'));
  return amount <= BigInt(2147483647) ? Number(amount) : null;
}

export function BillingScreen() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await apiRequest<InvoicePage>(`/billing/invoices?page=${page}&pageSize=25`, { signal });
      if (!signal?.aborted) { setInvoices(result.items); setTotal(result.total); setError(null); }
    } catch (e) { if (!signal?.aborted) setError(errorMessage(e)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<InvoicePage>(`/billing/invoices?page=${page}&pageSize=25`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setInvoices(result.items); setTotal(result.total); setError(null); } })
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);

  if (selectedInvoice) return <InvoiceDetailView id={selectedInvoice} onBack={() => { setSelectedInvoice(null); void load(); }} />;
  if (showCreate) return <CreateInvoiceView onBack={() => { setShowCreate(false); void load(); }} />;

  return <>
    <div className="page-heading"><div><div className="eyebrow">BILLING</div><h1>Invoices</h1><p>Create invoices, record payments and manage credits.</p></div>
      <Button onClick={() => setShowCreate(true)}><Icon name="grid" /> Create invoice</Button></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    {loading ? <div className="page-state" role="status"><span className="loading-ring" />Loading…</div> :
      invoices.length === 0 ? <Card className="planned-card"><span className="empty-icon"><Icon name="grid" /></span><h2>No invoices yet</h2><p>Create an invoice from uninvoiced confirmed orders.</p></Card> :
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Invoice #</th><th>Company</th><th>Total</th><th>Credits</th><th>Paid</th><th>Net due</th><th>Issued</th><th>Status</th></tr></thead><tbody>
        {invoices.map((inv) => <tr key={inv.id}>
          <td><Button variant="ghost" onClick={() => setSelectedInvoice(inv.id)}>INV-{inv.number}</Button></td><td>{inv.companyName}</td>
          <td>{formatMoney(inv.totalMinor)}</td><td>{inv.creditTotalMinor > 0 ? `-${formatMoney(inv.creditTotalMinor)}` : '—'}</td>
          <td>{inv.paidAmountMinor > 0 ? formatMoney(inv.paidAmountMinor) : '—'}</td>
          <td className={inv.netDueMinor < 0 ? 'credit-value' : inv.netDueMinor > 0 ? 'due-value' : ''}>{formatMoney(inv.netDueMinor)}</td>
          <td>{new Date(inv.issuedAt).toLocaleDateString()}</td>
          <td><span className={`status-pill ${inv.paidAt ? 'paid' : 'unpaid'}`}>{inv.paidAt ? 'Paid' : 'Unpaid'}</span></td>
        </tr>)}
      </tbody></table>
      {total > 25 && <div className="pagination"><Button variant="ghost" disabled={page <= 1} onClick={() => { setLoading(true); setPage(p => p - 1); }}>← Previous</Button><span>Page {page} of {Math.ceil(total / 25)}</span><Button variant="ghost" disabled={page * 25 >= total} onClick={() => { setLoading(true); setPage(p => p + 1); }}>Next →</Button></div>}
      </div>}
  </>;
}

function CreateInvoiceView({ onBack }: { onBack: () => void }) {
  const { session } = useSession();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [uninvoiced, setUninvoiced] = useState<UninvoicedOrderSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<PendingAction>(null);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCompanies() {
      const records: { id: string; name: string }[] = [];
      for (let page = 1; ; page++) {
        const result = await apiRequest<PageResponse<{ id: string; name: string }>>(`/companies?page=${page}&pageSize=100`, { signal: controller.signal });
        records.push(...result.items);
        if (records.length >= result.total || result.items.length === 0) break;
      }
      if (!controller.signal.aborted) setCompanies(records);
    }
    void loadCompanies().catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    apiRequest<UninvoicedOrderSummary[]>(`/billing/companies/${companyId}/uninvoiced`).then((orders) => {
      if (active) { setUninvoiced(orders); setSelected(new Set(orders.map(o => o.id))); }
    }).catch((e) => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId]);

  const total = uninvoiced.filter(o => selected.has(o.id)).reduce((s, o) => s + o.totalMinor, 0);

  async function submit() {
    if (busy.current || !session || loading || selected.size === 0 || selected.size > 1000) return;
    busy.current = true;
    setSubmitting(true); setError(null);
    const payload = { companyId, orderIds: Array.from(selected).sort() };
    try {
      await apiRequest('/billing/invoices', {
        method: 'POST', headers: { 'x-csrf-token': session.csrfToken },
        body: JSON.stringify({ ...payload, actionId: actionId(pending, payload) }),
      });
      pending.current = null;
      onBack();
    } catch (e) { setError(errorMessage(e)); }
    finally { busy.current = false; setSubmitting(false); }
  }

  return <>
    <div className="page-heading"><div><Button variant="ghost" onClick={onBack}>← Back</Button><h1>Create invoice</h1></div></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    <Card className="form-card">
      <div className="form-group"><label>Company</label>
        <select aria-label="Company" disabled={submitting} value={companyId} onChange={(e) => { setCompanyId(e.target.value); setSelected(new Set()); setUninvoiced([]); setLoading(Boolean(e.target.value)); setError(null); }}>
          <option value="">Select a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      {loading && <div className="page-state"><span className="loading-ring" />Loading orders…</div>}
      {uninvoiced.length > 0 && <>
        <div className="form-group"><label>Select orders ({selected.size} of {uninvoiced.length} selected, total: {formatMoney(total)})</label>
        <div className="data-table-wrapper"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Include all orders" disabled={submitting} checked={selected.size === uninvoiced.length} onChange={(e) => setSelected(e.target.checked ? new Set(uninvoiced.map(o => o.id)) : new Set())} /></th><th>#</th><th>Employee</th><th>Delivery</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {uninvoiced.map((o) => <tr key={o.id}><td><input type="checkbox" disabled={submitting} aria-label={`Include order ${o.number}`} checked={selected.has(o.id)} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(o.id); else next.delete(o.id); setSelected(next); }} /></td>
            <td>{o.number}</td><td>{o.employeeName}</td><td>{o.deliveryDate}</td><td>{formatMoney(o.totalMinor)}</td><td>{o.status}</td></tr>)}
        </tbody></table></div></div>
        {selected.size > 1000 && <p role="alert">Select at most 1,000 orders per invoice.</p>}
        <Button onClick={() => void submit()} disabled={submitting || loading || selected.size === 0 || selected.size > 1000}>
          {submitting ? 'Creating…' : `Create invoice for ${formatMoney(total)}`}
        </Button>
      </>}
      {companyId && !loading && uninvoiced.length === 0 && <p className="empty-note">No uninvoiced confirmed orders for this company.</p>}
    </Card>
  </>;
}

function InvoiceDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { session } = useSession();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [creditOrderId, setCreditOrderId] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [crediting, setCrediting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pendingPay = useRef<PendingAction>(null);
  const pendingCredit = useRef<PendingAction>(null);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<InvoiceDetail>(`/billing/invoices/${id}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setInvoice(result); setError(null); } })
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  async function refresh() {
    if (busy.current) return;
    busy.current = true; setRefreshing(true);
    try { setInvoice(await apiRequest<InvoiceDetail>(`/billing/invoices/${id}`)); setError(null); }
    catch (e) { setError(errorMessage(e)); }
    finally { busy.current = false; setRefreshing(false); }
  }

  async function pay() {
    const amount = invoice?.netDueMinor;
    if (busy.current || !session || amount === undefined || amount < 0) return;
    busy.current = true;
    setPaying(true); setError(null);
    const payload = { id, amountMinor: amount };
    try {
      const result = await apiRequest<InvoiceDetail>(`/billing/invoices/${id}/pay`, {
        method: 'POST', headers: { 'x-csrf-token': session.csrfToken },
        body: JSON.stringify({ amountMinor: amount, actionId: actionId(pendingPay, payload) }),
      });
      pendingPay.current = null; setInvoice(result);
    } catch (e) { setError(errorMessage(e)); }
    finally { busy.current = false; setPaying(false); }
  }

  async function addCredit() {
    const amount = parseMoney(creditAmount);
    if (busy.current || !session || !amount || amount <= 0 || !creditOrderId || !creditReason.trim()) {
      if (!amount || amount <= 0) setError('Enter a positive amount with at most two decimal places.');
      return;
    }
    busy.current = true;
    setCrediting(true); setError(null);
    const payload = { orderId: creditOrderId, amountMinor: amount, reason: creditReason.trim() };
    try {
      const result = await apiRequest<InvoiceDetail>(`/billing/invoices/${id}/credit`, {
        method: 'POST', headers: { 'x-csrf-token': session.csrfToken },
        body: JSON.stringify({ ...payload, actionId: actionId(pendingCredit, payload) }),
      });
      pendingCredit.current = null; setInvoice(result); setCreditOrderId(''); setCreditAmount(''); setCreditReason('');
    } catch (e) { setError(errorMessage(e)); }
    finally { busy.current = false; setCrediting(false); }
  }

  if (loading) return <div className="page-state" role="status"><span className="loading-ring" />Loading invoice…</div>;
  if (!invoice) return <div className="page-state" role="alert">{error || 'Invoice not found'}</div>;

  return <>
    <div className="page-heading"><div><Button variant="ghost" onClick={onBack}>← Back to invoices</Button><h1>Invoice INV-{invoice.number}</h1><p>{invoice.companyName} · Issued {new Date(invoice.issuedAt).toLocaleDateString()}</p></div>
      <div><Button variant="ghost" onClick={() => void refresh()} disabled={paying || crediting || refreshing}>{refreshing ? 'Refreshing…' : 'Refresh invoice'}</Button><span className={`status-pill ${invoice.paidAt ? 'paid' : 'unpaid'}`}>{invoice.paidAt ? 'Paid' : 'Unpaid'}</span></div></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    <Card className="form-card"><h2>Recorded billing details</h2><p>{invoice.company.billingName} · {invoice.company.billingContactName}</p><p>{invoice.company.billingEmail}</p><p>{invoice.company.billingAddress}</p><p>Each order retains its purchase-time billing details; invoice identity and gross stay fixed.</p></Card>
    <div className="dashboard-grid">
      <Card className="stat-card"><div className="stat-label">Invoice total</div><div className="stat-value">{formatMoney(invoice.totalMinor)}</div></Card>
      <Card className="stat-card"><div className="stat-label">Credits</div><div className="stat-value">-{formatMoney(invoice.creditTotalMinor)}</div></Card>
      <Card className="stat-card"><div className="stat-label">Paid</div><div className="stat-value">{formatMoney(invoice.paidAmountMinor)}</div></Card>
      <Card className="stat-card"><div className="stat-label">Net due</div><div className={`stat-value ${invoice.netDueMinor < 0 ? 'credit-value' : ''}`}>{formatMoney(invoice.netDueMinor)}</div></Card>
    </div>
    <Card className="form-card"><h2>Orders ({invoice.orders.length})</h2>
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>#</th><th>Employee</th><th>Delivery</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        {invoice.orders.map((o) => <tr key={o.id}><td><Link href={`/orders/${o.id}`}>{o.number}</Link></td><td>{o.employeeName}</td><td>{o.deliveryDate}</td><td>{formatMoney(o.totalMinor)}</td><td>{o.status}</td></tr>)}
      </tbody></table></div>
    </Card>
    {invoice.credits.length > 0 && <Card className="form-card"><h2>Credits</h2>
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Order #</th><th>Amount</th><th>Reason</th><th>Date</th></tr></thead><tbody>
        {invoice.credits.map((c) => <tr key={c.id}><td>{c.orderNumber}</td><td>-{formatMoney(c.amountMinor)}</td><td>{c.reason}</td><td>{new Date(c.createdAt).toLocaleDateString()}</td></tr>)}
      </tbody></table></div>
    </Card>}
    {!invoice.paidAt && invoice.netDueMinor >= 0 && <Card className="form-card"><h2>Record payment</h2>
      <p>Settle the current outstanding amount of {formatMoney(invoice.netDueMinor)}. Later credits remain company credit.</p>
      <Button onClick={() => void pay()} disabled={paying || crediting || refreshing}>{paying ? 'Recording…' : 'Mark paid'}</Button>
    </Card>}
    <Card className="form-card"><h2>Add credit</h2><p>Delivered shortages allow a reasoned partial credit. Cancel a confirmed order from its order detail to issue the full remaining credit.</p>
      <div className="form-group"><label htmlFor="credit-order">Order</label><select id="credit-order" aria-label="Credit order" disabled={crediting || paying} value={creditOrderId} onChange={(e) => setCreditOrderId(e.target.value)}><option value="">Select order…</option>
        {invoice.orders.filter(o => o.status === 'DELIVERED').map(o => <option key={o.id} value={o.id}>#{o.number} — {o.employeeName} ({formatMoney(o.totalMinor)})</option>)}</select></div>
      <div className="form-group"><label htmlFor="credit-amount">Amount ($)</label><input id="credit-amount" aria-label="Credit amount ($)" disabled={crediting || paying} type="number" step="0.01" min="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} /></div>
      <div className="form-group"><label htmlFor="credit-reason">Reason</label><input id="credit-reason" aria-label="Credit reason" disabled={crediting || paying} type="text" maxLength={2000} value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Shortage, cancellation, etc." /></div>
      <Button onClick={() => void addCredit()} disabled={crediting || paying || refreshing || !creditOrderId || !creditAmount || !creditReason.trim()}>{crediting ? 'Adding…' : 'Add credit'}</Button>
    </Card>
  </>;
}
