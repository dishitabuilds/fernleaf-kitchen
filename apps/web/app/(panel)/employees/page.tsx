import { EmployeesScreen } from '@/features/configuration/employees';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) { const { companyId } = await searchParams; return <WorkspaceShell allowedRoles={['ADMIN']}><EmployeesScreen initialCompanyId={companyId} /></WorkspaceShell>; }
