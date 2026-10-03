export const ROLES = ['ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'session.read', 'session.logout', 'settings.read', 'settings.manage',
  'catalogue.manage', 'companies.manage', 'employees.manage', 'staff.manage',
  'orders.create', 'orders.manage', 'orders.override', 'orders.read',
  'prep.read', 'prep.start', 'prep.complete', 'prep.force-complete',
  'dispatch.read', 'dispatch.assign', 'dispatch.depart',
  'deliveries.read.own', 'deliveries.complete.own', 'deliveries.complete',
  'billing.manage', 'dashboard.read'
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Capabilities for future modules are declared here; this does not implement their routes.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  KITCHEN: ['session.read', 'session.logout', 'dashboard.read', 'prep.read', 'prep.start', 'prep.complete'],
  DISPATCH: ['session.read', 'session.logout', 'dashboard.read', 'dispatch.read', 'dispatch.assign', 'dispatch.depart'],
  DRIVER: ['session.read', 'session.logout', 'dashboard.read', 'deliveries.read.own', 'deliveries.complete.own']
};

export interface StaffIdentity { id: string; email: string; displayName: string; role: Role }
export interface SessionResponse { user: StaffIdentity; permissions: Permission[]; csrfToken: string; expiresAt: string }
export interface LoginRequest { email: string; password: string }
export * from './configuration';
export * from './catalogue';
export interface HealthResponse { status: 'ok'; database: 'connected'; service: 'fernleaf-api' }
export interface ApiError { code: string; message: string; fieldErrors?: Record<string, string[]>; requestId: string }
