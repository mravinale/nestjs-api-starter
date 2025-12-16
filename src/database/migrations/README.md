# Database Migrations

This directory contains SQL migrations for setting up the database schema.

## Migration Files

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Creates all tables and seeds unified role model |
| `002_create_test_admin.sql` | Creates test admin user for development |

## Fresh Installation

For a fresh database, run migrations in order:

```bash
# Create database
createdb nestjs-api-starter

# Run initial schema migration
psql -d nestjs-api-starter -f src/database/migrations/001_initial_schema.sql

# (Optional) Create test admin user
psql -d nestjs-api-starter -f src/database/migrations/002_create_test_admin.sql
```

## Schema Overview

### Better Auth Core Tables
- **user** - User accounts with role field
- **session** - Active sessions with impersonation support
- **account** - OAuth/credential accounts
- **verification** - Email verification and password reset tokens
- **jwks** - JWT key storage

### Better Auth Organization Tables
- **organization** - Organizations/teams
- **member** - Organization membership with roles
- **invitation** - Pending invitations

### RBAC Tables
- **roles** - Role definitions (admin, manager, member)
- **permissions** - Permission definitions (resource:action)
- **role_permissions** - Role-permission assignments

## Unified Role Model

| Role | Scope | Description |
|------|-------|-------------|
| **admin** | Global | Platform administrator with full access |
| **manager** | Organization | Organization manager with org-scoped access |
| **member** | Organization | Organization member with basic read access |

### Permission Matrix

| Permission | Admin | Manager | Member |
|------------|-------|---------|--------|
| user:create | ✅ | ❌ | ❌ |
| user:read | ✅ | ✅ | ✅ |
| user:update | ✅ | ✅ | ❌ |
| user:delete | ✅ | ❌ | ❌ |
| user:ban | ✅ | ✅ | ❌ |
| user:impersonate | ✅ | ❌ | ❌ |
| user:set-role | ✅ | ❌ | ❌ |
| user:set-password | ✅ | ❌ | ❌ |
| session:read | ✅ | ✅ | ❌ |
| session:revoke | ✅ | ✅ | ❌ |
| session:delete | ✅ | ❌ | ❌ |
| organization:create | ✅ | ❌ | ❌ |
| organization:read | ✅ | ✅ | ✅ |
| organization:update | ✅ | ✅ | ❌ |
| organization:delete | ✅ | ❌ | ❌ |
| organization:invite | ✅ | ✅ | ❌ |
| role:create | ✅ | ❌ | ❌ |
| role:read | ✅ | ✅ | ✅ |
| role:update | ✅ | ❌ | ❌ |
| role:delete | ✅ | ❌ | ❌ |
| role:assign | ✅ | ❌ | ❌ |

## Automatic Migration

The application also runs migrations automatically on startup via `RbacMigrationService`:
- Creates RBAC tables if they don't exist
- Seeds default roles and permissions
- Uses `ON CONFLICT DO NOTHING` to be idempotent

## Existing Database Migration

If migrating from an older role model (user/moderator/owner), run:

```bash
psql -d nestjs-api-starter -f src/rbac/migrations/unify-roles.sql
```

This updates:
- `roles` table: moderator → manager, user → member
- `user.role` column: user → member, moderator → manager
- `member.role` column: owner → admin, admin → manager
