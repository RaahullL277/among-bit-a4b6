import { SetMetadata } from '@nestjs/common';

/** Marks a route as not requiring API-key auth (e.g. health, provider webhooks). */
export const IS_PUBLIC_KEY = 'acp:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
