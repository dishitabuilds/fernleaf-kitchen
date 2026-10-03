import { FoundationOverview } from '@/features/workspace/foundation-overview';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function TodayPage() { return <WorkspaceShell allowedRoles={['DRIVER', 'ADMIN']}><FoundationOverview role="DRIVER" /></WorkspaceShell>; }
