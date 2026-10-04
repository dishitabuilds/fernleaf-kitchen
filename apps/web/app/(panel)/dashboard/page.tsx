import { RoleDashboard } from '@/features/workspace/role-dashboard';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function DashboardPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><RoleDashboard /></WorkspaceShell>; }
