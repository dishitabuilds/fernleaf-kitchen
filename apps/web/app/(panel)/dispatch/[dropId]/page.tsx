import { DeliveryDropScreen } from '@/features/operations/drops';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default async function DeliveryGroupPage({ params }: { params: Promise<{ dropId: string }> }) {
  const { dropId } = await params;
  return <WorkspaceShell allowedRoles={['DISPATCH', 'ADMIN']}><DeliveryDropScreen dropId={dropId} /></WorkspaceShell>;
}
