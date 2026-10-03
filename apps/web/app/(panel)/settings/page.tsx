import { SettingsShell } from '@/features/settings/settings-shell';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function SettingsPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><SettingsShell /></WorkspaceShell>; }
