import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PartnerContext } from '@acp/core';

/** Routes with no partner session required (the login endpoints). */
export const PARTNER_PUBLIC_KEY = 'acp:partnerPublic';
export const PartnerPublic = () => SetMetadata(PARTNER_PUBLIC_KEY, true);

/** Injects the PartnerContext the guard attached to the request. */
export const Partner = createParamDecorator((_d: unknown, ctx: ExecutionContext): PartnerContext => {
  return ctx.switchToHttp().getRequest().partner as PartnerContext;
});
