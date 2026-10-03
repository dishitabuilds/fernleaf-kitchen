import { CatalogueScreen } from '@/features/configuration/catalogue';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function CataloguePage() { return <WorkspaceShell allowedRoles={['ADMIN']}><CatalogueScreen /></WorkspaceShell>; }
