import type { Role } from '@fernleaf/contracts';

export type StaffRole = Role;

export const roleDetails: Record<StaffRole, { label: string; href: string; title: string; description: string; phase: number; next: string }> = {
  ADMIN: {
    label: 'Admin', href: '/dashboard', title: 'Operations overview',
    description: 'A clear view of the kitchen, from company orders to delivery and billing.',
    phase: 2, next: 'Create orders with quotes, snapshots and cutoff processing.',
  },
  KITCHEN: {
    label: 'Kitchen', href: '/kitchen', title: 'Kitchen workspace',
    description: 'The place to prepare confirmed meals and keep every station moving.',
    phase: 3, next: 'Prepare confirmed orders, grouped by station and combination.',
  },
  DISPATCH: {
    label: 'Dispatch', href: '/dispatch', title: 'Dispatch workspace',
    description: 'Coordinate ready meals, drivers and company delivery drops.',
    phase: 3, next: 'Assign drivers and release ready delivery drops.',
  },
  DRIVER: {
    label: 'Driver', href: '/today', title: 'Your delivery day',
    description: 'Your assigned stops for today, with everything you need on the road.',
    phase: 3, next: 'See your assigned stops and record completed deliveries.',
  },
};
