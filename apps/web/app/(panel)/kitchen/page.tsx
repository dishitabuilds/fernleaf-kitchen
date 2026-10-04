import { KitchenBoardScreen } from '@/features/operations/kitchen';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <WorkspaceShell allowedRoles={['KITCHEN', 'ADMIN']}><KitchenBoardScreen key={date ?? 'today'} initialDate={date} /></WorkspaceShell>;
}
