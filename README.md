# NestJS API Starter

A production-ready **NestJS** API with **Better Auth**, **RBAC**, **Organization Management**, and **PostgreSQL**.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Unified Role Model](#unified-role-model)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Development](#development)
- [Companion Frontend](#companion-frontend)

---

## Features

| Category | Features |
|----------|----------|
| **Authentication** | Email/password, email verification, password reset, JWT tokens |
| **Authorization** | Unified 3-role model (Admin, Manager, Member), permission-based access |
| **Organizations** | Multi-tenant support, member management, invitations |
| **Admin** | User management, session management, impersonation |
| **RBAC** | Custom roles, granular permissions, role-permission assignments |
| **API** | OpenAPI documentation, health checks, CORS support |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.x
- **PostgreSQL** >= 14.x
- **npm** >= 10.x

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd nestjs-api-starter
npm install
```

### 2. Create Database

```bash
createdb nestjs-api-starter
```

### 3. Run Migrations

```bash
# Run initial schema migration (creates all tables + seeds roles)
psql -d nestjs-api-starter -f src/database/migrations/001_initial_schema.sql

# (Optional) Create test admin user: test@example.com / password123
psql -d nestjs-api-starter -f src/database/migrations/002_create_test_admin.sql
```

### 4. Configure Environment

Create `.env` file:

```env
# Required
DATABASE_URL=postgresql://your-user@localhost:5432/nestjs-api-starter
AUTH_SECRET=your-super-secret-key-min-32-characters-long

# Optional
PORT=3000
BASE_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:5173,http://localhost:5174
FE_URL=http://localhost:5173
RESEND_API_KEY=re_xxxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com
```

### 5. Start Server

```bash
npm run start:dev
```

### 6. Verify

```bash
curl http://localhost:3000/api/auth/ok
# Response: {"ok":true}
```

---

## Project Structure

```
src/
├── auth.ts                    # Better Auth configuration
├── permissions.ts             # Access control definitions
├── main.ts                    # Application entry point
├── app.module.ts              # Main module
│
├── common/                    # Shared utilities
│   ├── guards/                # Auth guards (RolesGuard, OrgRoleGuard)
│   └── decorators/            # Custom decorators (@Roles, @OrgRoles)
│
├── config/                    # Configuration module
│   └── config.service.ts      # Environment variables
│
├── database/                  # Database module
│   ├── database.service.ts    # PostgreSQL connection
│   └── migrations/            # SQL migration files
│       ├── 001_initial_schema.sql
│       ├── 002_create_test_admin.sql
│       └── README.md
│
├── email/                     # Email module (Resend)
│   └── email.service.ts       # Email sending
│
├── organization/              # Organization module
│   ├── controllers/           # Org impersonation endpoints
│   └── services/              # Org impersonation logic
│
├── platform-admin/            # Platform admin module
│   ├── controllers/           # Admin org management endpoints
│   └── services/              # Admin org management logic
│
└── rbac/                      # RBAC module
    ├── rbac.controller.ts     # Roles & permissions endpoints
    ├── rbac.migration.ts      # Auto-seeds roles on startup
    ├── role.service.ts        # Role CRUD operations
    └── permission.service.ts  # Permission management
```

---

## Unified Role Model

The system uses a **3-role model** that applies consistently across the platform:

| Role | Scope | Description |
|------|-------|-------------|
| **Admin** | Global | Platform administrator with full access to all organizations and settings |
| **Manager** | Organization | Organization manager with full access within their assigned organization |
| **Member** | Organization | Organization member with basic read access |

### Permission Matrix

| Permission | Admin | Manager | Member |
|------------|:-----:|:-------:|:------:|
| **User Management** |
| user:create | ✅ | ❌ | ❌ |
| user:read | ✅ | ✅ | ✅ |
| user:update | ✅ | ✅ | ❌ |
| user:delete | ✅ | ❌ | ❌ |
| user:ban | ✅ | ✅ | ❌ |
| user:impersonate | ✅ | ❌ | ❌ |
| user:set-role | ✅ | ❌ | ❌ |
| **Session Management** |
| session:read | ✅ | ✅ | ❌ |
| session:revoke | ✅ | ✅ | ❌ |
| session:delete | ✅ | ❌ | ❌ |
| **Organization Management** |
| organization:create | ✅ | ❌ | ❌ |
| organization:read | ✅ | ✅ | ✅ |
| organization:update | ✅ | ✅ | ❌ |
| organization:delete | ✅ | ❌ | ❌ |
| organization:invite | ✅ | ✅ | ❌ |
| **Role Management** |
| role:create | ✅ | ❌ | ❌ |
| role:read | ✅ | ✅ | ✅ |
| role:update | ✅ | ❌ | ❌ |
| role:delete | ✅ | ❌ | ❌ |
| role:assign | ✅ | ❌ | ❌ |

### Role Storage

- **Platform role**: Stored in `user.role` column (admin, manager, member)
- **Organization role**: Stored in `member.role` column for org-scoped access

---

## Database Schema

### Tables Overview

| Category | Tables |
|----------|--------|
| **Better Auth Core** | `user`, `session`, `account`, `verification`, `jwks` |
| **Better Auth Org** | `organization`, `member`, `invitation` |
| **RBAC** | `roles`, `permissions`, `role_permissions` |

### Key Tables

**user**
```sql
id TEXT PRIMARY KEY
name TEXT NOT NULL
email TEXT UNIQUE NOT NULL
emailVerified BOOLEAN
role TEXT DEFAULT 'member'  -- Platform role: admin, manager, member
banned BOOLEAN
```

**member** (Organization membership)
```sql
id TEXT PRIMARY KEY
organizationId TEXT REFERENCES organization(id)
userId TEXT REFERENCES user(id)
role TEXT NOT NULL  -- Org role: admin, manager, member
```

**roles** (RBAC)
```sql
id UUID PRIMARY KEY
name VARCHAR(50) UNIQUE  -- admin, manager, member
display_name VARCHAR(100)
description TEXT
is_system BOOLEAN  -- System roles cannot be deleted
```

### Migration Commands

```bash
# Fresh install - run all migrations
psql -d nestjs-api-starter -f src/database/migrations/001_initial_schema.sql

# Migrate from old role model (user/moderator/owner)
psql -d nestjs-api-starter -f src/rbac/migrations/unify-roles.sql
```

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sign-up/email` | Register new user |
| POST | `/sign-in/email` | Login |
| POST | `/sign-out` | Logout |
| GET | `/get-session` | Get current session |
| POST | `/verify-email` | Verify email |
| POST | `/forget-password` | Request password reset |
| POST | `/reset-password` | Reset password |
| GET | `/token` | Get JWT token |
| GET | `/ok` | Health check |
| GET | `/reference` | OpenAPI docs |

### Organization (`/api/auth/organization`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create` | Create organization |
| GET | `/list` | List user's organizations |
| POST | `/invite-member` | Invite member |
| POST | `/accept-invitation` | Accept invitation |
| POST | `/reject-invitation` | Reject invitation |
| DELETE | `/remove-member` | Remove member |

### Admin (`/api/auth/admin`)

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| GET | `/list-users` | List all users | admin |
| POST | `/ban-user` | Ban user | admin |
| POST | `/unban-user` | Unban user | admin |
| POST | `/set-role` | Change user role | admin |
| POST | `/impersonate-user` | Impersonate user | admin |
| POST | `/stop-impersonating` | Stop impersonation | admin |

### Platform Admin (`/api/platform-admin`)

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| GET | `/organizations` | List all organizations | admin |
| GET | `/organizations/:id` | Get organization details | admin |
| PUT | `/organizations/:id` | Update organization | admin |
| DELETE | `/organizations/:id` | Delete organization | admin |
| GET | `/organizations/:id/members` | Get org members | admin |

### RBAC (`/api/rbac`)

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| GET | `/roles` | List all roles | any |
| POST | `/roles` | Create role | admin |
| PUT | `/roles/:id` | Update role | admin |
| DELETE | `/roles/:id` | Delete role | admin |
| GET | `/permissions` | List all permissions | any |
| PUT | `/roles/:id/permissions` | Assign permissions | admin |

### Org Impersonation (`/api/organization`)

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| POST | `/:orgId/impersonate` | Impersonate org member | admin, manager |
| POST | `/stop-impersonating` | Stop impersonation | any |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `AUTH_SECRET` | ✅ | - | Secret for signing tokens (min 32 chars) |
| `PORT` | ❌ | `3000` | Server port |
| `BASE_URL` | ❌ | `http://localhost:3000` | API base URL |
| `TRUSTED_ORIGINS` | ❌ | `localhost:5173,5174` | CORS origins (comma-separated) |
| `FE_URL` | ❌ | `http://localhost:5173` | Frontend URL for email links |
| `RESEND_API_KEY` | ❌ | - | Resend API key for emails |
| `FROM_EMAIL` | ❌ | - | Sender email address |
| `NODE_ENV` | ❌ | `development` | Environment (test disables email verification) |

---

## Testing

### Unit Tests

```bash
npm run test           # Run all tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
```

### E2E Tests

E2E tests are in the companion frontend project (`spa-api-starter`):

```bash
cd ../spa-api-starter
npx playwright test --headed --workers=1
```

**Test Coverage (123 tests):**
- Authentication flows (signup, login, password reset)
- Admin panel access and navigation
- Role-based access control (Admin/Manager/Member)
- Organization management
- RBAC permissions
- API protection

---

## Development

### Scripts

```bash
npm run start:dev      # Development with hot reload
npm run start:prod     # Production mode
npm run build          # Build for production
npm run lint           # ESLint
npm run format         # Prettier
```

### Adding a New Module

```bash
nest g module my-feature
nest g controller my-feature
nest g service my-feature
```

### Protecting Routes

**By Platform Role:**
```typescript
@Controller('admin')
@UseGuards(RolesGuard)
export class AdminController {
  @Get('users')
  @Roles('admin')
  listUsers() { ... }
}
```

**By Organization Role:**
```typescript
@Controller('org/:orgId')
@UseGuards(OrgRoleGuard)
export class OrgController {
  @Put('settings')
  @OrgRoles('admin', 'manager')
  updateSettings() { ... }
}
```

### Database Access

```typescript
@Injectable()
export class MyService {
  constructor(private readonly db: DatabaseService) {}

  async getUsers() {
    return this.db.query<User>('SELECT * FROM "user"');
  }
}
```

---

## Companion Frontend

This API is designed to work with **[spa-api-starter](../spa-api-starter)** — a React SPA with:

- Login/Signup/Password Reset pages
- Admin Panel (Users, Sessions, Organizations, Roles)
- Role-based navigation
- Impersonation UI
- Organization management

### Running Together

```bash
# Terminal 1: Backend
cd nestjs-api-starter
npm run start:dev

# Terminal 2: Frontend
cd spa-api-starter
npm run dev
```

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| NestJS | 11.x | Backend framework |
| TypeScript | 5.x | Type safety |
| Better Auth | 1.4.x | Authentication |
| PostgreSQL | 14+ | Database |
| Resend | 6.x | Email service |
| Jest | 29.x | Testing |

### Better Auth Plugins

| Plugin | Purpose |
|--------|---------|
| `bearer` | Bearer token authentication |
| `jwt` | JWT token generation |
| `openAPI` | API documentation |
| `organization` | Multi-tenant support |
| `admin` | Admin endpoints |

---

## License

MIT
