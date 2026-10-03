'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page-state"><h1>We could not open this page</h1><p>Please try again.</p><Button onClick={reset}>Try again</Button></main>;
}
