import { DriverTodayScreen } from '@/features/operations/driver';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function TodayPage() { return <WorkspaceShell allowedRoles={['DRIVER']}><DriverTodayScreen /></WorkspaceShell>; }
