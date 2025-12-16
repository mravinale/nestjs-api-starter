export class PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export class UpdateOrganizationDto {
  name?: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, unknown>;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  created_at: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: Date;
}

export interface OrganizationWithMemberCount extends Organization {
  memberCount: number;
}

export function rowToOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
  };
}
