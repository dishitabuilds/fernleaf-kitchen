import { OrderBuilderScreen } from '@/features/orders/builder';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default async function EditOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <WorkspaceShell allowedRoles={['ADMIN']}><OrderBuilderScreen orderId={orderId} /></WorkspaceShell>;
}
