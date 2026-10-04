'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { errorMessage } from '@/lib/http';
import { roleDetails, type StaffRole } from '@/lib/roles';
import { useSession } from '@/features/auth/session-provider';

export function WorkspaceShell({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: StaffRole[] }) {
  const { session, loading, error, refresh, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session && !error) router.replace('/login');
  }, [session, loading, error, router]);

  if (loading) return <div className="page-state" role="status"><span className="loading-ring" />Opening your workspace…</div>;
  if (error) return <main className="page-state"><h1>Unable to check your session</h1><p role="alert">{error}</p><Button onClick={() => void refresh()}>Try again</Button></main>;
  if (!session) return <div className="page-state" role="status">Returning to sign in…</div>;

  const role = roleDetails[session.user.role];
  const canView = allowedRoles.includes(session.user.role);
  const canReadSettings = session.permissions.includes('settings.read');

  async function logout() {
    setLogoutPending(true);
    setLogoutError(null);
    try { await signOut(); router.replace('/login'); }
    catch (failure) { setLogoutError(errorMessage(failure)); }
    finally { setLogoutPending(false); }
  }

  return <div className={`workspace ${session.user.role === 'DRIVER' ? 'driver-workspace' : ''}`}>
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    <aside className="sidebar">
      <Link href={role.href} className="wordmark"><span className="brand-icon"><Icon name="leaf" /></span><span>fernleaf<span className="wordmark-sub">KITCHEN</span></span></Link>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        <Link href={role.href} aria-current={pathname === role.href ? 'page' : undefined} className={`nav-link ${pathname === role.href ? 'active' : ''}`}>
          <Icon name={session.user.role === 'DRIVER' || session.user.role === 'DISPATCH' ? 'truck' : session.user.role === 'KITCHEN' ? 'utensils' : 'grid'} />{session.user.role === 'DRIVER' ? 'Today’s route' : role.label === 'Admin' ? 'Overview' : role.label}
        </Link>
        {session.user.role === 'ADMIN' && [['/orders', 'Orders'], ['/kitchen', 'Kitchen'], ['/dispatch', 'Dispatch'], ['/billing', 'Billing'], ['/staff', 'Staff'], ['/catalogue', 'Catalogue'], ['/menu', 'Menu'], ['/pricing', 'Pricing'], ['/companies', 'Companies'], ['/employees', 'Employees']].map(([href, label]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? 'page' : undefined} className={`nav-link ${pathname.startsWith(href) ? 'active' : ''}`}><Icon name={href === '/catalogue' || href === '/menu' || href === '/kitchen' ? 'utensils' : href === '/dispatch' ? 'truck' : 'grid'} />{label}</Link>)}
        {canReadSettings && <Link href="/settings" aria-current={pathname === '/settings' ? 'page' : undefined} className={`nav-link ${pathname === '/settings' ? 'active' : ''}`}><Icon name="settings" />Settings</Link>}
      </nav>
      <div className="sidebar-bottom"><div className="phase-label"><span className="status-dot" />Fernleaf Kitchen</div><p>Times shown in Asia/Kolkata</p></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-header"><span className="header-context">Kitchen time <span>Asia/Kolkata</span></span><div className="account-actions"><span className="role-badge">{role.label}</span><span className="account-name">{session.user.displayName}</span><Button variant="ghost" onClick={() => void logout()} disabled={logoutPending}><Icon name="logout" /><span>{logoutPending ? 'Signing out…' : 'Sign out'}</span></Button></div></header>
      {logoutError && <div className="header-error" role="alert">{logoutError}</div>}
      <main id="workspace-content" className="workspace-content">
        {canView ? children : <Card className="restricted-card"><span className="empty-icon"><Icon name="lock" /></span><h1>Access restricted</h1><p>Your {role.label.toLowerCase()} account cannot open this workspace.</p><Link className="button button-primary" href={role.href}>Return to my workspace<Icon name="arrow" /></Link></Card>}
      </main>
      <footer className="workspace-footer"><span>Fernleaf Kitchen</span><span>Thoughtfully prepared. Reliably delivered.</span></footer>
    </div>
  </div>;
}
