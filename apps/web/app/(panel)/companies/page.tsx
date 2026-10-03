import { CompaniesScreen } from '@/features/configuration/companies';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function CompaniesPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><CompaniesScreen /></WorkspaceShell>; }
