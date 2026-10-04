import { OrdersScreen } from '@/features/orders/list';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ invoiced?: string; billable?: string }> }) {
  const query = await searchParams;
  return <WorkspaceShell allowedRoles={['ADMIN']}><OrdersScreen initialBillingQueue={query.invoiced === 'false' && query.billable === 'true'} /></WorkspaceShell>;
}
