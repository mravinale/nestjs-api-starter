import { Module } from '@nestjs/common';
import { AdminOrganizationsController } from './controllers';
import { AdminOrganizationsService } from './services';

/**
 * Platform Admin Module for platform-level administrative operations.
 * All endpoints require platform admin role (user.role === 'admin').
 */
@Module({
  controllers: [AdminOrganizationsController],
  providers: [AdminOrganizationsService],
  exports: [AdminOrganizationsService],
})
export class PlatformAdminModule {}
