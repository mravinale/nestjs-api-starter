import { Module } from '@nestjs/common';
import { OrgImpersonationController } from './controllers';
import { OrgImpersonationService } from './services';

/**
 * Organization Module for org-scoped operations.
 * Provides org-scoped impersonation for org managers.
 */
@Module({
  controllers: [OrgImpersonationController],
  providers: [OrgImpersonationService],
  exports: [OrgImpersonationService],
})
export class OrganizationModule {}
