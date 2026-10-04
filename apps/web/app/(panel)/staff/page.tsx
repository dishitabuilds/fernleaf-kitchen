import { StaffScreen } from '@/features/staff/staff-screen';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function StaffPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><StaffScreen /></WorkspaceShell>; }
