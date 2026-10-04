import { KitchenOrderScreen } from '@/features/operations/kitchen';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default async function KitchenOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <WorkspaceShell allowedRoles={['KITCHEN', 'ADMIN']}><KitchenOrderScreen orderId={orderId} /></WorkspaceShell>;
}
