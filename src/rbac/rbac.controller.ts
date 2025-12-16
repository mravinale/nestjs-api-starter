import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard, Roles } from '../common';
import { RoleService, PermissionService } from './services';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './dto';

/**
 * Controller for RBAC management endpoints
 */
@Controller('api/rbac')
@UseGuards(RolesGuard)
export class RbacController {
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
  ) {}

  // ============ Roles ============

  /**
   * Get all roles
   */
  @Get('roles')
  async getRoles() {
    const roles = await this.roleService.findAll();
    return { data: roles };
  }

  /**
   * Get role by ID with permissions
   */
  @Get('roles/:id')
  async getRole(@Param('id') id: string) {
    const role = await this.roleService.findById(id);
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }
    const permissions = await this.roleService.getPermissions(id);
    return { data: { ...role, permissions } };
  }

  /**
   * Create a new role (admin only)
   */
  @Post('roles')
  @Roles('admin')
  async createRole(@Body() dto: CreateRoleDto) {
    // Check if role name already exists
    const existing = await this.roleService.findByName(dto.name);
    if (existing) {
      throw new HttpException('Role name already exists', HttpStatus.CONFLICT);
    }

    const role = await this.roleService.create(dto);
    return { data: role };
  }

  /**
   * Update a role (admin only)
   */
  @Put('roles/:id')
  @Roles('admin')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.roleService.update(id, dto);
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }
    return { data: role };
  }

  /**
   * Delete a role (admin only)
   */
  @Delete('roles/:id')
  @Roles('admin')
  async deleteRole(@Param('id') id: string) {
    try {
      await this.roleService.delete(id);
      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Cannot delete system role') {
          throw new HttpException(error.message, HttpStatus.FORBIDDEN);
        }
        if (error.message === 'Role not found') {
          throw new HttpException(error.message, HttpStatus.NOT_FOUND);
        }
      }
      throw error;
    }
  }

  /**
   * Assign permissions to a role (admin only)
   */
  @Put('roles/:id/permissions')
  @Roles('admin')
  async assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    const role = await this.roleService.findById(id);
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }

    await this.roleService.assignPermissions(id, dto.permissionIds);
    const permissions = await this.roleService.getPermissions(id);
    return { data: { ...role, permissions } };
  }

  // ============ Permissions ============

  /**
   * Get all permissions
   */
  @Get('permissions')
  async getPermissions() {
    const permissions = await this.permissionService.findAll();
    return { data: permissions };
  }

  /**
   * Get permissions grouped by resource
   */
  @Get('permissions/grouped')
  async getPermissionsGrouped() {
    const grouped = await this.permissionService.findGroupedByResource();
    return { data: grouped };
  }

  // ============ User Permissions ============

  /**
   * Get effective permissions for a user based on their role
   */
  @Get('users/:roleName/permissions')
  async getUserPermissions(@Param('roleName') roleName: string) {
    const permissions = await this.roleService.getUserPermissions(roleName);
    return { data: permissions };
  }

  /**
   * Check if a role has a specific permission
   */
  @Get('check/:roleName/:resource/:action')
  async checkPermission(
    @Param('roleName') roleName: string,
    @Param('resource') resource: string,
    @Param('action') action: string,
  ) {
    const hasPermission = await this.roleService.hasPermission(
      roleName,
      resource,
      action,
    );
    return { data: { hasPermission } };
  }
}
