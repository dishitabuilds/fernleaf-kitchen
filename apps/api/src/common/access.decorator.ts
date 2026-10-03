import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@fernleaf/contracts';

export const ACCESS_METADATA = 'fernleaf:access';
export type AccessPolicy = { public: true } | { authenticated: true } | { permissions: Permission[] };

export const Public = () => SetMetadata(ACCESS_METADATA, { public: true } satisfies AccessPolicy);
export const Authenticated = () => SetMetadata(ACCESS_METADATA, { authenticated: true } satisfies AccessPolicy);
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(ACCESS_METADATA, { permissions } satisfies AccessPolicy);
