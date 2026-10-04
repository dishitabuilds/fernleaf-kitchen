import { DispatchScreen } from '@/features/operations/dispatch';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <WorkspaceShell allowedRoles={['DISPATCH', 'ADMIN']}><DispatchScreen key={date ?? 'today'} initialDate={date} /></WorkspaceShell>;
}
