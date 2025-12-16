import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RoleService, PermissionService } from './services';
import { RbacMigrationService } from './rbac.migration';

/**
 * RBAC Module for role-based access control
 */
@Module({
  controllers: [RbacController],
  providers: [RoleService, PermissionService, RbacMigrationService],
  exports: [RoleService, PermissionService],
})
export class RbacModule {}
