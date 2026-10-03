import { PricingScreen } from '@/features/configuration/pricing';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function PricingPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><PricingScreen /></WorkspaceShell>; }
