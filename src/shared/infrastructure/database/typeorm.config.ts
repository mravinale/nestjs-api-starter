import { DataSourceOptions } from 'typeorm';
import { RoleTypeOrmEntity } from '../../../modules/admin/rbac/infrastructure/persistence/entities/role.typeorm-entity';
import { PermissionTypeOrmEntity } from '../../../modules/admin/rbac/infrastructure/persistence/entities/permission.typeorm-entity';

/**
 * Safely decode a URI component, falling back to raw value if malformed.
 * This prevents URIError when passwords contain unencoded percent signs.
 */
function safeDecodeURIComponent(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Parse a database URL into individual connection fields.
 * This avoids TypeORM's internal decodeURIComponent() call which throws
 * URIError when the password contains unencoded percent signs or other
 * URI-unsafe characters.
 */
export function parseDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 5432,
    username: safeDecodeURIComponent(parsed.username),
    password: safeDecodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: parsed.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : undefined,
  };
}

export function buildTypeOrmConfig(databaseUrl: string): DataSourceOptions {
  const { host, port, username, password, database, ssl } = parseDatabaseUrl(databaseUrl);
  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    ...(ssl && { ssl }),
    synchronize: false,
    logging: false,
    entities: [RoleTypeOrmEntity, PermissionTypeOrmEntity],
    migrations: [],
  };
}
