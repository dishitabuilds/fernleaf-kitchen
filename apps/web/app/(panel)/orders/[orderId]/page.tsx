import { OrderDetailScreen } from '@/features/orders/detail';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) { const { orderId } = await params; return <WorkspaceShell allowedRoles={['ADMIN']}><OrderDetailScreen orderId={orderId} /></WorkspaceShell>; }
