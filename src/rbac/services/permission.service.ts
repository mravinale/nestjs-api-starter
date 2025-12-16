import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database';
import { Permission, PermissionRow, rowToPermission } from '../entities/role.entity';

/**
 * Service for managing permissions in the RBAC system
 */
@Injectable()
export class PermissionService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get all permissions
   */
  async findAll(): Promise<Permission[]> {
    const rows = await this.db.query<PermissionRow>(
      'SELECT * FROM permissions ORDER BY resource, action',
    );
    return rows.map(rowToPermission);
  }

  /**
   * Find permission by ID
   */
  async findById(id: string): Promise<Permission | null> {
    const row = await this.db.queryOne<PermissionRow>(
      'SELECT * FROM permissions WHERE id = $1',
      [id],
    );
    return row ? rowToPermission(row) : null;
  }

  /**
   * Find permission by resource and action
   */
  async findByResourceAction(resource: string, action: string): Promise<Permission | null> {
    const row = await this.db.queryOne<PermissionRow>(
      'SELECT * FROM permissions WHERE resource = $1 AND action = $2',
      [resource, action],
    );
    return row ? rowToPermission(row) : null;
  }

  /**
   * Get permissions grouped by resource
   */
  async findGroupedByResource(): Promise<Record<string, Permission[]>> {
    const permissions = await this.findAll();
    return permissions.reduce(
      (acc, perm) => {
        if (!acc[perm.resource]) {
          acc[perm.resource] = [];
        }
        acc[perm.resource].push(perm);
        return acc;
      },
      {} as Record<string, Permission[]>,
    );
  }

  /**
   * Create a new permission (for extensibility)
   */
  async create(resource: string, action: string, description?: string): Promise<Permission> {
    const row = await this.db.queryOne<PermissionRow>(
      `INSERT INTO permissions (resource, action, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [resource, action, description ?? null],
    );
    if (!row) {
      throw new Error('Failed to create permission');
    }
    return rowToPermission(row);
  }
}
