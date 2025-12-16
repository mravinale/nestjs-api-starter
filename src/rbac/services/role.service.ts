import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database';
import {
  Role,
  Permission,
  RoleRow,
  PermissionRow,
  rowToRole,
  rowToPermission,
} from '../entities/role.entity';
import { CreateRoleDto, UpdateRoleDto } from '../dto';

/**
 * Service for managing roles in the RBAC system
 */
@Injectable()
export class RoleService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get all roles
   */
  async findAll(): Promise<Role[]> {
    const rows = await this.db.query<RoleRow>(
      'SELECT * FROM roles ORDER BY is_system DESC, name ASC',
    );
    return rows.map(rowToRole);
  }

  /**
   * Find role by ID
   */
  async findById(id: string): Promise<Role | null> {
    const row = await this.db.queryOne<RoleRow>(
      'SELECT * FROM roles WHERE id = $1',
      [id],
    );
    return row ? rowToRole(row) : null;
  }

  /**
   * Find role by name
   */
  async findByName(name: string): Promise<Role | null> {
    const row = await this.db.queryOne<RoleRow>(
      'SELECT * FROM roles WHERE name = $1',
      [name],
    );
    return row ? rowToRole(row) : null;
  }

  /**
   * Create a new role
   */
  async create(dto: CreateRoleDto): Promise<Role> {
    const row = await this.db.queryOne<RoleRow>(
      `INSERT INTO roles (name, display_name, description, color, is_system)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [dto.name, dto.displayName, dto.description ?? null, dto.color ?? 'gray'],
    );
    if (!row) {
      throw new Error('Failed to create role');
    }
    return rowToRole(row);
  }

  /**
   * Update a role
   */
  async update(id: string, dto: UpdateRoleDto): Promise<Role | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(dto.displayName);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(dto.color);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const row = await this.db.queryOne<RoleRow>(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return row ? rowToRole(row) : null;
  }

  /**
   * Delete a role (only non-system roles)
   */
  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Role not found');
    }
    if (existing.isSystem) {
      throw new Error('Cannot delete system role');
    }

    await this.db.query('DELETE FROM roles WHERE id = $1', [id]);
  }

  /**
   * Get permissions for a role
   */
  async getPermissions(roleId: string): Promise<Permission[]> {
    const rows = await this.db.query<PermissionRow>(
      `SELECT p.* FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.resource, p.action`,
      [roleId],
    );
    return rows.map(rowToPermission);
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.db.transaction(async (query) => {
      // Remove existing permissions
      await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

      // Add new permissions
      for (const permissionId of permissionIds) {
        await query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
          [roleId, permissionId],
        );
      }
    });
  }

  /**
   * Get user's effective permissions based on their role
   */
  async getUserPermissions(roleName: string): Promise<Permission[]> {
    const role = await this.findByName(roleName);
    if (!role) {
      return [];
    }
    return this.getPermissions(role.id);
  }

  /**
   * Check if a role has a specific permission
   */
  async hasPermission(roleName: string, resource: string, action: string): Promise<boolean> {
    const row = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.name = $1 AND p.resource = $2 AND p.action = $3`,
      [roleName, resource, action],
    );
    return row ? parseInt(row.count, 10) > 0 : false;
  }
}
