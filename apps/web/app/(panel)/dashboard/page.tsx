import { FoundationOverview } from '@/features/workspace/foundation-overview';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function DashboardPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><FoundationOverview role="ADMIN" /></WorkspaceShell>; }
