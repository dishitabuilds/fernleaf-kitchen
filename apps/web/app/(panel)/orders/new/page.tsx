import { OrderBuilderScreen } from '@/features/orders/builder';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function NewOrderPage() {
  return <WorkspaceShell allowedRoles={['ADMIN']}><OrderBuilderScreen /></WorkspaceShell>;
}
