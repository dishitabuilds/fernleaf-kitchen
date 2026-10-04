'use client';

import { useEffect, useState, useCallback } from 'react';
import type { StaffPage, StaffUserResponse } from '@fernleaf/contracts';
import { ROLES } from '@fernleaf/contracts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { apiRequest, errorMessage } from '@/lib/http';
import { useSession } from '@/features/auth/session-provider';

export function StaffScreen() {
  const { session } = useSession();
  const [staff, setStaff] = useState<StaffUserResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<StaffPage>(`/staff?page=${page}&pageSize=25`);
      setStaff(result.items); setTotal(result.total); setError(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  if (showCreate) return <StaffForm onBack={() => { setShowCreate(false); void load(); }} />;
  if (editId) return <StaffForm id={editId} onBack={() => { setEditId(null); void load(); }} />;

  return <>
    <div className="page-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Staff accounts</h1><p>Create and manage staff members across all roles.</p></div>
      <Button onClick={() => setShowCreate(true)}><Icon name="grid" /> Add staff member</Button></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    {loading ? <div className="page-state" role="status"><span className="loading-ring" />Loading…</div> :
      staff.length === 0 ? <Card className="planned-card"><h2>No staff accounts</h2></Card> :
      <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>
        {staff.map((s) => <tr key={s.id} onClick={() => setEditId(s.id)} className="clickable-row">
          <td><strong>{s.displayName}</strong></td><td>{s.email}</td>
          <td><span className="role-badge">{s.role}</span></td>
          <td><span className={`status-pill ${s.active ? 'active' : 'inactive'}`}>{s.active ? 'Active' : 'Inactive'}</span></td>
          <td>{new Date(s.createdAt).toLocaleDateString()}</td>
        </tr>)}
      </tbody></table>
      {total > 25 && <div className="pagination"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button><span>Page {page}</span><Button variant="ghost" disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}>Next →</Button></div>}
      </div>}
  </>;
}

function StaffForm({ id, onBack }: { id?: string; onBack: () => void }) {
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('ADMIN');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiRequest<StaffUserResponse>(`/staff/${id}`).then((s) => {
      setEmail(s.email); setDisplayName(s.displayName); setRole(s.role); setActive(s.active);
    }).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, [id]);

  async function save() {
    setSaving(true); setError(null);
    try {
      if (id) {
        const body: Record<string, unknown> = { displayName, role, active };
        if (password) body.password = password;
        await apiRequest(`/staff/${id}`, { method: 'PATCH', headers: { 'x-csrf-token': session!.csrfToken }, body: JSON.stringify(body) });
      } else {
        await apiRequest('/staff', { method: 'POST', headers: { 'x-csrf-token': session!.csrfToken }, body: JSON.stringify({ email, displayName, password, role }) });
      }
      onBack();
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="page-state"><span className="loading-ring" />Loading…</div>;

  return <>
    <div className="page-heading"><div><Button variant="ghost" onClick={onBack}>← Back</Button><h1>{id ? 'Edit staff member' : 'Add staff member'}</h1></div></div>
    {error && <div className="header-error" role="alert">{error}</div>}
    <Card className="form-card">
      {!id && <div className="form-group"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
      <div className="form-group"><label>Display name</label><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
      <div className="form-group"><label>{id ? 'New password (leave empty to keep current)' : 'Password'}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div className="form-group"><label>Role</label><select value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
      {id && <div className="form-group"><label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label></div>}
      <Button onClick={() => void save()} disabled={saving || !displayName || (!id && (!email || !password))}>{saving ? 'Saving…' : id ? 'Save changes' : 'Create account'}</Button>
    </Card>
  </>;
}
