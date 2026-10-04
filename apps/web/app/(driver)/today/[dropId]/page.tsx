import { DeliveryDropScreen } from '@/features/operations/drops';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default async function DeliveryStopPage({ params }: { params: Promise<{ dropId: string }> }) {
  const { dropId } = await params;
  return <WorkspaceShell allowedRoles={['DRIVER']}><DeliveryDropScreen dropId={dropId} driver /></WorkspaceShell>;
}
