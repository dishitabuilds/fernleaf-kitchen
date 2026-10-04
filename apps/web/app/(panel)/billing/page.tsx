import { BillingScreen } from '@/features/billing/billing-screen';
import { WorkspaceShell } from '@/features/workspace/workspace-shell';
export default function BillingPage() { return <WorkspaceShell allowedRoles={['ADMIN']}><BillingScreen /></WorkspaceShell>; }
