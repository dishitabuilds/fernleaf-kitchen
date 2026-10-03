import { MenuScreen } from '@/features/configuration/menu';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function MenuPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><MenuScreen /></WorkspaceShell>; }
