import Link from 'next/link';

export default function NotFound() {
  return <main className="page-state"><h1>Page not found</h1><p>This page may have moved or is still planned.</p><Link className="button button-primary" href="/login">Open my workspace</Link></main>;
}
