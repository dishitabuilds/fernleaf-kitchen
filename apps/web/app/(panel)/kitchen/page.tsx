import { FoundationOverview } from '@/features/workspace/foundation-overview';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';

export default function KitchenPage() { return <WorkspaceShell allowedRoles={['KITCHEN', 'ADMIN']}><FoundationOverview role="KITCHEN" /></WorkspaceShell>; }
