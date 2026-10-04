'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { InvoicePage, InvoiceSummary, InvoiceDetail, UninvoicedOrderSummary, CompanyResponse, PageResponse } from '@fernleaf/contracts';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest, errorMessage } from '@/lib/http';
import { useSession } from '@/features/auth/session-provider';

function formatMoney(minor: number): string { return `$${(minor / 100).toFixed(2)}`; }
function generateId(): string { return `billing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

export function BillingScreen() {
  const { session } = useSession();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<InvoicePage>(`/billing/invoices?page=${page}&pageSize=25`);
      setInvoices(result.items); setTotal(result.total); setError(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  if (selectedInvoice) return <InvoiceDetailView id={selectedInvoice} onBack={() => { setSelectedInvoice(null); void load(); }} />;
  if (showCreate) return <CreateInvoiceView onBack={() => { setShowCreate(false); void load(); }} />;

  return <>
    <div className="page-heading"><div><div className="eyebrow">BILLING</div><h1>Invoices</h1><p>Create invoices, record payments and manage credits.</p></div>
      <Button onClick={() => setShowCreate(true)}><Icon name="grid" /> Create invoice</Button></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    {loading ? <div className="page-state" role="status"><span className="loading-ring" />Loading…</div> :
      invoices.length === 0 ? <Card className="planned-card"><span className="empty-icon"><Icon name="grid" /></span><h2>No invoices yet</h2><p>Create an invoice from uninvoiced confirmed orders.</p></Card> :
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Invoice #</th><th>Company</th><th>Total</th><th>Credits</th><th>Paid</th><th>Net due</th><th>Issued</th><th>Status</th></tr></thead><tbody>
        {invoices.map((inv) => <tr key={inv.id} onClick={() => setSelectedInvoice(inv.id)} className="clickable-row">
          <td><strong>INV-{inv.number}</strong></td><td>{inv.companyName}</td>
          <td>{formatMoney(inv.totalMinor)}</td><td>{inv.creditTotalMinor > 0 ? `-${formatMoney(inv.creditTotalMinor)}` : '—'}</td>
          <td>{inv.paidAmountMinor > 0 ? formatMoney(inv.paidAmountMinor) : '—'}</td>
          <td className={inv.netDueMinor < 0 ? 'credit-value' : inv.netDueMinor > 0 ? 'due-value' : ''}>{formatMoney(inv.netDueMinor)}</td>
          <td>{new Date(inv.issuedAt).toLocaleDateString()}</td>
          <td><span className={`status-pill ${inv.paidAt ? 'paid' : 'unpaid'}`}>{inv.paidAt ? 'Paid' : 'Unpaid'}</span></td>
        </tr>)}
      </tbody></table>
      {total > 25 && <div className="pagination"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</Button><span>Page {page} of {Math.ceil(total / 25)}</span><Button variant="ghost" disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}>Next →</Button></div>}
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

  useEffect(() => {
    apiRequest<PageResponse<{ id: string; name: string }>>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!companyId) { setUninvoiced([]); return; }
    setLoading(true);
    apiRequest<UninvoicedOrderSummary[]>(`/billing/companies/${companyId}/uninvoiced`).then((orders) => {
      setUninvoiced(orders); setSelected(new Set(orders.map(o => o.id)));
    }).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, [companyId]);

  const total = uninvoiced.filter(o => selected.has(o.id)).reduce((s, o) => s + o.totalMinor, 0);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      await apiRequest('/billing/invoices', {
        method: 'POST', headers: { 'x-csrf-token': session!.csrfToken },
        body: JSON.stringify({ companyId, orderIds: Array.from(selected), actionId: generateId() }),
      });
      onBack();
    } catch (e) { setError(errorMessage(e)); }
    finally { setSubmitting(false); }
  }

  return <>
    <div className="page-heading"><div><Button variant="ghost" onClick={onBack}>← Back</Button><h1>Create invoice</h1></div></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    <Card className="form-card">
      <div className="form-group"><label>Company</label>
        <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setSelected(new Set()); }}>
          <option value="">Select a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      {loading && <div className="page-state"><span className="loading-ring" />Loading orders…</div>}
      {uninvoiced.length > 0 && <>
        <div className="form-group"><label>Select orders ({selected.size} of {uninvoiced.length} selected, total: {formatMoney(total)})</label>
        <div className="data-table-wrapper"><table className="data-table"><thead><tr><th><input type="checkbox" checked={selected.size === uninvoiced.length} onChange={(e) => setSelected(e.target.checked ? new Set(uninvoiced.map(o => o.id)) : new Set())} /></th><th>#</th><th>Employee</th><th>Delivery</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {uninvoiced.map((o) => <tr key={o.id}><td><input type="checkbox" checked={selected.has(o.id)} onChange={(e) => { const next = new Set(selected); e.target.checked ? next.add(o.id) : next.delete(o.id); setSelected(next); }} /></td>
            <td>{o.number}</td><td>{o.employeeName}</td><td>{o.deliveryDate}</td><td>{formatMoney(o.totalMinor)}</td><td>{o.status}</td></tr>)}
        </tbody></table></div></div>
        <Button onClick={() => void submit()} disabled={submitting || selected.size === 0}>
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
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [creditOrderId, setCreditOrderId] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [crediting, setCrediting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<InvoiceDetail>(`/billing/invoices/${id}`);
      setInvoice(result); setError(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function pay() {
    const amount = Math.round(parseFloat(payAmount) * 100);
    if (!amount || amount <= 0) return;
    setPaying(true); setError(null);
    try {
      await apiRequest(`/billing/invoices/${id}/pay`, {
        method: 'POST', headers: { 'x-csrf-token': session!.csrfToken },
        body: JSON.stringify({ amountMinor: amount, actionId: generateId() }),
      });
      setPayAmount(''); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setPaying(false); }
  }

  async function addCredit() {
    const amount = Math.round(parseFloat(creditAmount) * 100);
    if (!amount || amount <= 0 || !creditOrderId || !creditReason.trim()) return;
    setCrediting(true); setError(null);
    try {
      await apiRequest(`/billing/invoices/${id}/credit`, {
        method: 'POST', headers: { 'x-csrf-token': session!.csrfToken },
        body: JSON.stringify({ orderId: creditOrderId, amountMinor: amount, reason: creditReason.trim(), actionId: generateId() }),
      });
      setCreditOrderId(''); setCreditAmount(''); setCreditReason(''); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setCrediting(false); }
  }

  if (loading) return <div className="page-state" role="status"><span className="loading-ring" />Loading invoice…</div>;
  if (!invoice) return <div className="page-state" role="alert">{error || 'Invoice not found'}</div>;

  return <>
    <div className="page-heading"><div><Button variant="ghost" onClick={onBack}>← Back to invoices</Button><h1>Invoice INV-{invoice.number}</h1><p>{invoice.companyName} · Issued {new Date(invoice.issuedAt).toLocaleDateString()}</p></div>
      <span className={`status-pill ${invoice.paidAt ? 'paid' : 'unpaid'}`}>{invoice.paidAt ? 'Paid' : 'Unpaid'}</span></div>
    {error && <div className="header-error" role="alert">{error}</div>}
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
    {!invoice.paidAt && <Card className="form-card"><h2>Record payment</h2>
      <div className="inline-form"><input type="number" step="0.01" min="0.01" placeholder="Amount ($)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
        <Button onClick={() => void pay()} disabled={paying || !payAmount}>{paying ? 'Recording…' : 'Mark paid'}</Button></div>
    </Card>}
    <Card className="form-card"><h2>Add credit</h2>
      <div className="form-group"><label>Order</label><select value={creditOrderId} onChange={(e) => setCreditOrderId(e.target.value)}><option value="">Select order…</option>
        {invoice.orders.map(o => <option key={o.id} value={o.id}>#{o.number} — {o.employeeName} ({formatMoney(o.totalMinor)})</option>)}</select></div>
      <div className="form-group"><label>Amount ($)</label><input type="number" step="0.01" min="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} /></div>
      <div className="form-group"><label>Reason</label><input type="text" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Shortage, cancellation, etc." /></div>
      <Button onClick={() => void addCredit()} disabled={crediting || !creditOrderId || !creditAmount || !creditReason.trim()}>{crediting ? 'Adding…' : 'Add credit'}</Button>
    </Card>
  </>;
}
