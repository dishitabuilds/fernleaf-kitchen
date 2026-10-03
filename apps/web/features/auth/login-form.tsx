'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/http';
import { roleDetails } from '@/lib/roles';
import { useSession } from './session-provider';

export function LoginForm() {
  const { session, loading, signIn } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session) router.replace(roleDetails[session.user.role].href);
  }, [session, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const values = new FormData(event.currentTarget);
    try {
      const next = await signIn(String(values.get('email')).trim(), String(values.get('password')));
      router.replace(roleDetails[next.user.role].href);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return <div className="login-form-wrap">
    <div className="eyebrow">STAFF WORKSPACE</div>
    <h1>Welcome back.</h1>
    <p className="login-intro">Sign in to your Fernleaf Kitchen account.</p>
    <form onSubmit={submit} className="login-form" aria-label="Sign in">
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="username" placeholder="you@fernleaf.com" required maxLength={254} disabled={pending} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={128} disabled={pending} />
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <Button type="submit" className="login-submit" disabled={pending || loading || Boolean(session)}>
        {pending ? 'Signing in…' : loading ? 'Checking session…' : 'Sign in'}<Icon name="arrow" />
      </Button>
    </form>
    <p className="login-note"><Icon name="lock" />Your workspace opens with your assigned staff permissions.</p>
    <details className="demo-accounts">
      <summary>Reviewer demo accounts</summary>
      <div className="demo-accounts-content">
        <p>Use <strong>Test@1234</strong> with any account below.</p>
        <dl>
          <div><dt>Admin</dt><dd>admin@test.com</dd></div>
          <div><dt>Kitchen</dt><dd>kitchen@test.com</dd></div>
          <div><dt>Dispatch</dt><dd>dispatch@test.com</dd></div>
          <div><dt>Driver</dt><dd>driver@test.com</dd></div>
        </dl>
        <p className="muted">Foundation preview: operational workflows are planned in the following phases.</p>
      </div>
    </details>
  </div>;
}
