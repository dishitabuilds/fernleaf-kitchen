import { FoundationOverview } from '@/features/workspace/foundation-overview';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function DispatchPage() { return <WorkspaceShell allowedRoles={['DISPATCH', 'ADMIN']}><FoundationOverview role="DISPATCH" /></WorkspaceShell>; }
