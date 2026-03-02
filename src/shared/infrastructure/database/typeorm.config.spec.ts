import { parseDatabaseUrl, buildTypeOrmConfig } from './typeorm.config';

describe('parseDatabaseUrl', () => {
  it('should parse a standard PostgreSQL URL', () => {
    const result = parseDatabaseUrl('postgresql://user:pass@localhost:5432/mydb');
    expect(result).toEqual({
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      database: 'mydb',
      ssl: undefined,
    });
  });

  it('should handle percent-encoded special characters in password', () => {
    const result = parseDatabaseUrl('postgresql://user:p%40ss%25word%21@host:5432/db');
    expect(result).toEqual({
      host: 'host',
      port: 5432,
      username: 'user',
      password: 'p@ss%word!',
      database: 'db',
      ssl: undefined,
    });
  });

  it('should handle malformed percent sequences gracefully', () => {
    const result = parseDatabaseUrl('postgresql://user:%k@host:5432/db');
    expect(result).toEqual({
      host: 'host',
      port: 5432,
      username: 'user',
      password: '%k', // falls back to raw value since %k is invalid percent-encoding
      database: 'db',
      ssl: undefined,
    });
  });

  it('should default port to 5432 when not specified', () => {
    const result = parseDatabaseUrl('postgresql://user:pass@host/db');
    expect(result.port).toBe(5432);
  });

  it('should handle sslmode=require', () => {
    const result = parseDatabaseUrl('postgresql://user:pass@host:5432/db?sslmode=require');
    expect(result.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('should not set ssl when sslmode is absent', () => {
    const result = parseDatabaseUrl('postgresql://user:pass@host:5432/db');
    expect(result.ssl).toBeUndefined();
  });
});

describe('buildTypeOrmConfig', () => {
  it('should return a valid DataSourceOptions with parsed fields', () => {
    const config = buildTypeOrmConfig('postgresql://admin:s3cr%25t@db.example.com:5433/production');
    expect(config).toMatchObject({
      type: 'postgres',
      host: 'db.example.com',
      port: 5433,
      username: 'admin',
      password: 's3cr%t',
      database: 'production',
      synchronize: false,
      logging: false,
    });
    expect(config).not.toHaveProperty('url');
  });

  it('should include ssl when sslmode=require', () => {
    const config = buildTypeOrmConfig('postgresql://u:p@h:5432/d?sslmode=require');
    expect(config).toHaveProperty('ssl', { rejectUnauthorized: false });
  });

  it('should include entity definitions', () => {
    const config = buildTypeOrmConfig('postgresql://u:p@h:5432/d');
    expect(config.entities).toBeDefined();
    expect((config.entities as unknown[]).length).toBeGreaterThan(0);
  });
});
