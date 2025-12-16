import { Module, Global, OnModuleDestroy, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '../config';

/**
 * Database service for executing queries
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Execute a query with parameters
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Execute a query within a transaction
   */
  async transaction<T>(callback: (query: (sql: string, params?: unknown[]) => Promise<unknown[]>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const queryFn = async (sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        return result.rows;
      };
      const result = await callback(queryFn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run migrations
   */
  async runMigrations(): Promise<void> {
    // Create migrations tracking table
    await this.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Migrations table ready');
  }
}

/**
 * Database module for managing PostgreSQL connections
 */
@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: async (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.getDatabaseUrl(),
        });
        // Test connection
        try {
          await pool.query('SELECT NOW()');
          console.log('✅ Database connected');
        } catch (error) {
          console.error('❌ Database connection failed:', error);
          throw error;
        }
        return pool;
      },
      inject: [ConfigService],
    },
    DatabaseService,
  ],
  exports: ['DATABASE_POOL', DatabaseService],
})
export class DatabaseModule {}
