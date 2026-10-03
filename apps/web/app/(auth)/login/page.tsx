import type { Metadata } from 'next';
import { Icon } from '@/components/icons';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <main className="login-page">
    <section className="login-brand" aria-label="Fernleaf Kitchen">
      <div className="wordmark"><span className="brand-icon"><Icon name="leaf" /></span><span>fernleaf<span className="wordmark-sub">KITCHEN</span></span></div>
      <div className="brand-message"><span className="eyebrow">GOOD FOOD. THOUGHTFULLY DELIVERED.</span><h2>From our kitchen,<br />to their everyday.</h2><p>One connected workspace for the people behind every meal.</p><div className="brand-divider" /><div className="brand-steps"><span>Prepare</span><span>Coordinate</span><span>Deliver</span></div></div>
      <p className="brand-footer">Company meals, cared for.</p>
      <div className="brand-art" aria-hidden="true"><span /><span /><span /></div>
    </section>
    <section className="login-content"><LoginForm /><p className="login-footer">Fernleaf Kitchen · Internal staff application</p></section>
  </main>;
}
