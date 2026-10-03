import { DirectMenuPreview } from '@/features/configuration/menu';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default async function SecretCategoryPage({ params }: { params: Promise<{ employeeId: string; categoryId: string }> }) { const { employeeId, categoryId } = await params; return <WorkspaceShell allowedRoles={['ADMIN']}><DirectMenuPreview employeeId={employeeId} categoryId={categoryId} /></WorkspaceShell>; }
