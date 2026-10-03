import { OrdersScreen } from '@/features/orders/list';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function OrdersPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><OrdersScreen /></WorkspaceShell>; }
