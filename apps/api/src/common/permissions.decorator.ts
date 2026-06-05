import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@acp/core';

/** Require the caller's actor to hold all listed permissions for this route. */
export const PERMISSIONS_KEY = 'acp:permissions';
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
