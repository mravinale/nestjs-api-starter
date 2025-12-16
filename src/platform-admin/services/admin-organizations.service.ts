import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database';
import {
  PaginationQuery,
  UpdateOrganizationDto,
  OrganizationRow,
  Organization,
  OrganizationWithMemberCount,
  rowToOrganization,
} from '../dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Service for platform-level organization management.
 * Allows platform admins to manage all organizations regardless of membership.
 */
@Injectable()
export class AdminOrganizationsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * List all organizations with pagination and search
   */
  async findAll(query: PaginationQuery): Promise<PaginatedResult<OrganizationWithMemberCount>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;
    const search = query.search?.trim();

    let whereClause = '';
    const params: unknown[] = [];

    if (search) {
      whereClause = 'WHERE o.name ILIKE $1 OR o.slug ILIKE $1';
      params.push(`%${search}%`);
    }

    const countResult = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM organization o ${whereClause}`,
      params,
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const dataParams = [...params, limit, offset];
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const rows = await this.db.query<OrganizationRow & { member_count: string }>(
      `SELECT o.*, COUNT(m.id) as member_count
       FROM organization o
       LEFT JOIN member m ON m.organization_id = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      dataParams,
    );

    const data: OrganizationWithMemberCount[] = rows.map((row) => ({
      ...rowToOrganization(row),
      memberCount: parseInt(row.member_count, 10),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single organization by ID
   */
  async findById(id: string): Promise<OrganizationWithMemberCount | null> {
    const row = await this.db.queryOne<OrganizationRow & { member_count: string }>(
      `SELECT o.*, COUNT(m.id) as member_count
       FROM organization o
       LEFT JOIN member m ON m.organization_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [id],
    );

    if (!row) {
      return null;
    }

    return {
      ...rowToOrganization(row),
      memberCount: parseInt(row.member_count, 10),
    };
  }

  /**
   * Update an organization
   */
  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.slug !== undefined) {
      updates.push(`slug = $${paramIndex++}`);
      values.push(dto.slug);
    }
    if (dto.logo !== undefined) {
      updates.push(`logo = $${paramIndex++}`);
      values.push(dto.logo);
    }
    if (dto.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(dto.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);

    const row = await this.db.queryOne<OrganizationRow>(
      `UPDATE organization SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return row ? rowToOrganization(row) : null;
  }

  /**
   * Delete an organization
   */
  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Organization not found');
    }

    await this.db.transaction(async (query) => {
      await query('DELETE FROM invitation WHERE organization_id = $1', [id]);
      await query('DELETE FROM member WHERE organization_id = $1', [id]);
      await query('DELETE FROM organization WHERE id = $1', [id]);
    });
  }

  /**
   * Get members of an organization
   */
  async getMembers(organizationId: string): Promise<Array<{
    id: string;
    userId: string;
    role: string;
    createdAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    };
  }>> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      role: string;
      created_at: Date;
      user_name: string;
      user_email: string;
      user_image: string | null;
    }>(
      `SELECT m.id, m.user_id, m.role, m.created_at,
              u.name as user_name, u.email as user_email, u.image as user_image
       FROM member m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.organization_id = $1
       ORDER BY m.created_at ASC`,
      [organizationId],
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        image: row.user_image,
      },
    }));
  }
}
