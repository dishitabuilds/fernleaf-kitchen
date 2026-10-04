'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/features/auth/session-provider';
import { ApiError, apiRequest, errorMessage } from '@/lib/http';

export type Values = Record<string, string | number | boolean | string[] | number[] | null | undefined>;
export type Choice = { value: string; label: string };
export interface FieldDefinition {
  name: string; label: string; type?: 'text' | 'number' | 'email' | 'url' | 'time' | 'date' | 'textarea' | 'checkbox' | 'select' | 'multiple' | 'days';
  required?: boolean; min?: number; max?: number; help?: string; choices?: Choice[]; placeholder?: string;
}
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
export function useResource<T>(path: string | null, loader: (path: string) => Promise<T> = apiRequest) {
  const [result, setResult] = useState<{ path: string; revision: number; data: T | null; failure: unknown } | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    let active = true;
    loader(path).then((data) => { if (active) setResult({ path, revision, data, failure: null }); }).catch((error: unknown) => { if (active) setResult({ path, revision, data: null, failure: error }); });
    return () => { active = false; };
  }, [path, revision, loader]);
  const current = result?.path === path && result.revision === revision ? result : null;
  return { data: current?.data ?? null, failure: current?.failure ?? null, loading: Boolean(path && !current), refresh };
}
// Choice controls need every available record, while the management tables remain
// server-paginated. Fetch selectors in bounded pages instead of silently truncating.
export function useChoiceResource<T>(path: string) {
  const loader = useCallback(async (choicePath: string): Promise<Paged<T>> => {
    const first = await apiRequest<Paged<T>>(choicePath);
    const items = [...first.items];
    const [route, query = ''] = choicePath.split('?');
    const parameters = new URLSearchParams(query);
    for (let page = first.page + 1; items.length < first.total; page++) {
      parameters.set('page', String(page));
      const next = await apiRequest<Paged<T>>(`${route}?${parameters}`);
      if (!next.items.length) break;
      items.push(...next.items);
    }
    return { ...first, items };
  }, []);
  return useResource<Paged<T>>(path, loader);
}
export function useMutation() {
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  async function mutate<T>(path: string, method: string, body: unknown, onSuccess?: (value: T) => void) {
    setPending(true); setFailure(null); setNotice('');
    try {
      const value = await apiRequest<T>(path, { method, headers: { 'x-csrf-token': session?.csrfToken ?? '' }, body: JSON.stringify(body) });
      setNotice('Changes saved.'); onSuccess?.(value); return value;
    } catch (error) { setFailure(error); return undefined; }
    finally { setPending(false); }
  }
  return { mutate, pending, failure, notice };
}
export function AffectedOrderLinks({ failure }: { failure: unknown }) {
  const values = failure instanceof ApiError ? failure.details?.orders ?? failure.details?.affectedOrders : null;
  if (!Array.isArray(values) || !values.length) return null;
  return <div><p>Review the orders affected by this change:</p><ul>{values.map((value, index) => {
    const record: Record<string, unknown> | null = typeof value === 'object' && value !== null ? value : null;
    const id = typeof value === 'string' ? value : typeof record?.id === 'string' ? record.id : typeof record?.orderId === 'string' ? record.orderId : null;
    if (!id) return null;
    return <li key={id}><Link href={`/orders/${id}`}>Order {typeof record?.number === 'number' ? `#${record.number}` : index + 1}{typeof record?.deliveryDate === 'string' ? ` · ${record.deliveryDate}` : ''}</Link></li>;
  })}</ul></div>;
}
export function Feedback({ failure, notice }: { failure?: unknown; notice?: string }) {
  return <>{failure ? <div className="form-feedback error" role="alert"><p>{errorMessage(failure)}</p>{failure instanceof ApiError && failure.fieldErrors && <ul>{Object.entries(failure.fieldErrors).map(([field, messages]) => <li key={field}>{field}: {messages.join(' ')}</li>)}</ul>}<AffectedOrderLinks failure={failure} /><p>If another staff member changed this record, refresh and review its latest values before saving.</p></div> : null}{notice && <p className="form-feedback success" role="status">{notice}</p>}</>;
}
export function Heading({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><div><div className="eyebrow">KITCHEN CONFIGURATION</div><h1>{title}</h1><p>{description}</p></div></div>;
}
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function FormFields({ fields, initial = {}, prefix }: { fields: FieldDefinition[]; initial?: Values; prefix: string }) {
  return <div className="form-grid">{fields.map((field) => {
    const id = `${prefix}-${field.name}`;
    const value = initial[field.name];
    if (field.type === 'checkbox') return <div key={field.name} className="checkbox-field"><label htmlFor={id}><input id={id} name={field.name} type="checkbox" defaultChecked={Boolean(value)} aria-describedby={field.help ? `${id}-help` : undefined} />{field.label}</label>{field.help && <span id={`${id}-help`} className="field-help">{field.help}</span>}</div>;
    if (field.type === 'days') return <fieldset key={field.name} className="form-field full"><legend>{field.label}</legend><div className="check-grid">{weekdays.map((day, index) => <label key={day}><input type="checkbox" name={field.name} value={index} defaultChecked={(value as number[] | undefined)?.includes(index)} />{day}</label>)}</div></fieldset>;
    return <div key={field.name} className={`form-field ${field.type === 'textarea' || field.type === 'multiple' ? 'full' : ''}`}><label htmlFor={id}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>{field.type === 'textarea' ? <textarea id={id} name={field.name} required={field.required} defaultValue={String(value ?? '')} placeholder={field.placeholder} rows={3} /> : field.type === 'select' || field.type === 'multiple' ? <select id={id} name={field.name} required={field.required} multiple={field.type === 'multiple'} defaultValue={field.type === 'multiple' ? (value as string[] ?? []) : String(value ?? '')}>{field.type === 'select' && <option value="">Choose {field.label.toLowerCase()}</option>}{field.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select> : <input id={id} name={field.name} type={field.type ?? 'text'} required={field.required} min={field.min} max={field.max} step={field.type === 'number' ? 1 : undefined} defaultValue={String(value ?? '')} placeholder={field.placeholder} />}{field.help && <span className="field-help">{field.help}</span>}</div>;
  })}</div>;
}
export function textValue(form: FormData, name: string) { return String(form.get(name) ?? '').trim(); }
export function nullableValue(form: FormData, name: string) { return textValue(form, name) || null; }
export function numberValue(form: FormData, name: string) { return Number(textValue(form, name)); }
export function checked(form: FormData, name: string) { return form.has(name); }
export function selections(form: FormData, name: string) { return form.getAll(name).map(String); }
export function lines(form: FormData, name: string) { return textValue(form, name).split(/\r?\n/).map((value) => value.trim()).filter(Boolean); }
export function moneyInput(minor: number | null | undefined): string { if (minor === null || minor === undefined) return ''; return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`; }
export function money(minor: number | null | undefined): string { return minor === null || minor === undefined ? 'Missing price' : `$${moneyInput(minor)}`; }
// Decimal text is converted using integer digits; the browser never derives prices.
export function parseMoney(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a nonnegative dollar amount with at most two decimal places, for example 2.15.');
  const [dollars, cents = ''] = value.split('.');
  const result = BigInt(dollars) * BigInt(100) + BigInt(cents.padEnd(2, '0'));
  if (result > BigInt(2_147_483_647)) throw new Error('The amount is too large.');
  return Number(result);
}
export function DataState({ loading, failure, refresh }: { loading: boolean; failure: unknown; refresh: () => void }) {
  return <>{loading && <p role="status" className="empty-copy">Loading configuration...</p>}{failure ? <div className="empty-copy"><Feedback failure={failure} /><Button variant="secondary" onClick={refresh}>Refresh</Button></div> : null}</>;
}
export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  return <div className="pagination"><span>{total} records · Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Next</Button></div>;
}
export function EditorForm({ title, fields, initial, pending, failure, notice, onSubmit, onCancel, children }: { title: string; fields: FieldDefinition[]; initial?: Values; pending: boolean; failure?: unknown; notice?: string; onSubmit: (form: FormData) => void; onCancel?: () => void; children?: ReactNode }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }
  return <Card className="editor-card"><h2>{title}</h2><form aria-label={title} onSubmit={submit}><FormFields fields={fields} initial={initial} prefix={title.replace(/\W/g, '-')} />{children}<Feedback failure={failure} notice={notice} /><div className="form-actions"><Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save changes'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel editing</Button>}</div></form></Card>;
}
export function RecordList<T extends { id: string }>({ path, title, columns, fields, defaults = {}, initial, payload, extra, searchParam = 'q', onSaved }: { path: string; title: string; columns: { label: string; render: (row: T) => ReactNode }[]; fields: FieldDefinition[] | ((row: T | null) => FieldDefinition[]); defaults?: Values; initial: (row: T) => Values; payload: (form: FormData, row: T | null) => unknown; extra?: (row: T) => ReactNode; searchParam?: string; onSaved?: () => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<T | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [localFailure, setLocalFailure] = useState<unknown>(null);
  const resource = useResource<Paged<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=20&${searchParam}=${encodeURIComponent(search)}`);
  const action = useMutation();
  const singular = title.toLowerCase().replace(/dishes$/, 'dish').replace(/ies$/, 'y').replace(/s$/, '');
  async function submit(form: FormData) {
    try { setLocalFailure(null); const body = payload(form, editing); await action.mutate<T>(editing ? `${path.split('?')[0]}/${editing.id}` : path.split('?')[0], editing ? 'PATCH' : 'POST', body, () => { resource.refresh(); onSaved?.(); setEditorOpen(false); }); }
    catch (error) { setLocalFailure(error); }
  }
  return <section className="config-section"><div className="section-toolbar"><h2>{title}</h2><Button onClick={() => { setEditing(null); setEditorOpen(true); setLocalFailure(null); }}>Add {singular}</Button></div><form className="filter-bar" aria-label={`Search ${title.toLowerCase()}`} onSubmit={(event) => { event.preventDefault(); setSearch(textValue(new FormData(event.currentTarget), 'search')); setPage(1); }}><label htmlFor={`${title}-search`}>Search {title.toLowerCase()}</label><input id={`${title}-search`} name="search" type="search" /><Button variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={resource.refresh}>Refresh</Button></form><DataState loading={resource.loading} failure={resource.failure} refresh={resource.refresh} /><Feedback failure={action.failure} notice={editorOpen ? '' : action.notice} />{resource.data && <Card><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{resource.data.items.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.label}>{column.render(row)}</td>)}<td><Button variant="ghost" onClick={() => { setEditing(row); setEditorOpen(true); setLocalFailure(null); }}>Edit</Button>{extra?.(row)}</td></tr>)}</tbody></table>{!resource.data.items.length && <p className="empty-copy">No matching {title.toLowerCase()}. Add a record or change your search.</p>}</div><Pagination page={page} total={resource.data.total} pageSize={resource.data.pageSize} onPage={setPage} /></Card>}{editorOpen && <EditorForm key={editing?.id ?? 'new'} title={`${editing ? 'Edit' : 'Add'} ${singular}`} fields={typeof fields === 'function' ? fields(editing) : fields} initial={editing ? initial(editing) : defaults} pending={action.pending} failure={localFailure ?? action.failure} onSubmit={(form) => void submit(form)} onCancel={() => setEditorOpen(false)} />}</section>;
}
