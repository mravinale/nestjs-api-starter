# DB-Driven Permissions Completion Report
Version: 2.0  
Repositories: `api-ampliri` (backend), `spa-ampliri` (frontend)  
Date: 2026-03-08  
Audience: LLM/agents implementing end-to-end RBAC hardening with minimal regression risk.

## 1. Goal
Finish current RBAC implementation so privileged authorization is **fully database-driven** while keeping Better Auth **fully compatible** for authentication, session lifecycle, and organization-member mechanics. Zero regressions in existing functionality.

## 2. Context and Findings (Current State)

### 2.1 What is already correct
1. Privileged custom controllers are guarded by `RolesGuard + PermissionsGuard + @RequirePermissions(...)`.
2. Permissions are resolved from DB through `RoleService` and RBAC repository for non-admin roles.
3. Core admin domains (users, sessions, organizations, RBAC) use guarded custom NestJS routes.
4. Hardcoded method-level `@Roles('admin')` decorators removed from RBAC and Organizations controllers — permission-based access now controls `role:create`, `role:update`, `role:delete`, `role:assign`, `organization:update`, `organization:delete` (done in `idp` branch).
5. Impersonation endpoint exists and is properly guarded:
   - `POST /api/organization/:organizationId/impersonate` in `src/modules/admin/organizations/api/controllers/org-impersonation.controller.ts`
   - Decorated with `@UseGuards(RolesGuard, PermissionsGuard)`, `@Roles('admin', 'manager')`, `@RequirePermissions('user:impersonate')`.
   - `stopImpersonating` remains unguarded (required for impersonated users to exit).
6. `session:delete` orphan permission removed from seed data in `rbac.migration.ts` (done in `idp` branch).
7. Manager session scoping added to organization `update` and `delete` (managers can only act on their active org).
8. Frontend dead code removed: `adminService.hasPermission()`, `organizationService.canCreateOrganization()`.
9. Frontend role hierarchy filtering implemented in `RolesPage` via `filterVisibleRoles()`.
10. Frontend `PermissionsContext` already implements deny-by-default while permission data is loading.
11. `rbac_005_backfill_role_permissions` migration ensures `role_permissions` table is populated for all three system roles.
12. `rbac_006_assign_all_permissions_to_admin` already exists in the current branch and provides the admin safety-net needed before removing the guard bypass.

### 2.2 Remaining gaps
1. **`PermissionsGuard` admin bypass** — `src/shared/guards/permissions.guard.ts` line 47: `if (userRole === 'admin') return true;` skips DB permission lookup entirely.
2. **`my-permissions` admin shortcut** — `src/modules/admin/rbac/api/controllers/rbac.controller.ts` line 68: admin path queries `permissionService.findAll()` (the `permissions` table) instead of `roleService.getUserPermissions('admin')` (the `role_permissions` join). Functionally equivalent today since seed grants admin all permissions, but source-of-truth is wrong.
3. **Better Auth static role config** — `src/permissions.ts` defines roles/statements wired into `auth.ts`. Not used for DB-guarded controllers, but FE still calls Better Auth admin client for two privileged operations.
4. **FE privileged Better Auth usage** — `adminService.ts` still calls `organization.checkSlug()` from Better Auth client, and still uses Better Auth for the admin-role impersonation path. Slug-check can be replaced now; admin impersonation should not be cut over to the org-scoped endpoint without a backend contract redesign.
5. **Live DB orphan** — `session:delete` removed from seed but no migration exists to clean it from live deployments.

### 2.3 Better Auth compatibility boundary (reference)
Better Auth **MUST remain responsible for** (do not replace):
- Authentication (login, signup, password reset, email verification)
- Session lifecycle (create, refresh, revoke via auth endpoints)
- Organization membership mechanics (`organization.setActive`, `organization.acceptInvitation`, `organization.rejectInvitation`, `organization.removeMember`, `organization.getFullOrganization`)
- Non-privileged org queries and mechanics (`organization.checkSlug` will be replaced, but `setActive` / invitation flows / membership mechanics stay)

Better Auth admin client usage in the frontend is split into two categories:
- `organization.checkSlug()` → replace in this phase with new `GET /api/platform-admin/organizations/check-slug`
- `admin.impersonateUser()` / `admin.stopImpersonating()` → do **not** replace in this phase; require a dedicated backend contract redesign before cutover

## 3. Target Architecture (Final State)

### 3.1 Responsibility split
1. **Better Auth** → authentication, session lifecycle, organization-member mechanics.
2. **DB RBAC** → all privileged authorization decisions (allow/deny based on `role_permissions` table).
3. **NestJS guards** → enforce DB permissions at the controller layer; no role-name shortcuts.

### 3.2 Hard invariants
1. No privileged allow/deny decision is based on static `permissions.ts` role statements.
2. No role-name bypass exists in `PermissionsGuard` — all roles resolve permissions from DB.
3. Permission changes in DB affect access on the next request (no cache, no restart).
4. Backend `@RequirePermissions` keys and frontend `can()` keys stay in contract parity.
5. Better Auth plugin integration is preserved — `auth.ts` and `permissions.ts` remain for auth compatibility.

## 4. Implementation Workstreams (ordered by dependency and risk)

### 4.1 Workstream 1: Migration safety net (prerequisite for all other work)
**Objective:** Use the existing admin safety-net migration and add the live cleanup migration needed before removing the guard bypass.

#### Changes
1. Treat existing migration `rbac_006_assign_all_permissions_to_admin` as the prerequisite admin safety-net.
2. Add migration `rbac_007_remove_session_delete_permission`:
   - Delete from `role_permissions` where `permission_id` references `session:delete`.
   - Delete from `permissions` where `resource='session' AND action='delete'`.
   - Idempotent (no-op if already absent).
3. Verify `rbac_006_assign_all_permissions_to_admin` is included in the deployment wave before removing the admin bypass from `PermissionsGuard`.

#### Files
- `src/modules/admin/rbac/rbac.migration.ts` — add the cleanup migration to `runTrackedMigrations()`.
- `src/modules/admin/rbac/rbac.migration.spec.ts` — add cleanup migration coverage and keep the existing admin backfill coverage.

#### Expected outcome
- `session:delete` removed from live DB.
- Admin role remains guaranteed to have all permissions in `role_permissions` via existing `rbac_006`.
- Safe to proceed with guard hardening.

#### Tests
- Existing `rbac_006_assign_all_permissions_to_admin` coverage remains and proves admin backfill is idempotent.
- `rbac_007_remove_session_delete_permission` removes `session:delete` and its role_permissions; re-running is no-op.

### 4.2 Workstream 2: Guard hardening (DB authority for all roles)
**Objective:** Remove admin bypass from `PermissionsGuard` so all roles resolve permissions from DB.

**Depends on:** Workstream 1 (admin must have DB grants before bypass removal).

#### Changes
1. Update `src/shared/guards/permissions.guard.ts`:
   - Remove lines 47-49 (`if (userRole === 'admin') return true;`).
   - All roles now go through `getUserPermissions(userRole)` → DB lookup.
   - Keep error semantics stable (`ForbiddenException` with missing permission details).

#### Expected outcome
Admin access is controlled by `role_permissions` table, same as manager/member.

#### Tests
1. `PermissionsGuard` denies admin if DB lacks required permission.
2. `PermissionsGuard` allows admin when DB grants required permission.
3. `PermissionsGuard` still allows when no `@RequirePermissions` decorator is present (passthrough).
4. `PermissionsGuard` requires ALL listed permissions (multi-permission check).
5. Existing controller specs continue to pass (no regression).

### 4.3 Workstream 3: my-permissions endpoint alignment
**Objective:** Make `GET /api/rbac/my-permissions` use the same DB path for all roles.

**Depends on:** Workstream 1 (admin must have DB grants to return correct results).

#### Changes
1. Update `src/modules/admin/rbac/api/controllers/rbac.controller.ts` in `getMyPermissions`:
   - Remove the `if (userRole === 'admin')` branch that queries `permissionService.findAll()`.
   - Use `roleService.getUserPermissions(userRole)` for all roles (same as the guard).
2. Update JSDoc to reflect DB-derived behavior.

#### Expected outcome
Frontend `can()` calls and backend guard decisions use the exact same DB source.

#### Tests
1. `getMyPermissions` returns DB-derived list for admin role.
2. `getMyPermissions` returns DB-derived list for manager role.
3. Response format unchanged: `{ data: string[] }`.
4. Member behavior remains out of scope unless the controller-level role contract is intentionally widened.

### 4.4 Workstream 4: Slug-check guarded endpoint (new)
**Objective:** Add a DB-guarded slug availability check and cut the FE slug-check flow over to it.

#### Changes
1. Add `GET /api/platform-admin/organizations/check-slug?slug=<value>` to `AdminOrganizationsController`.
2. Guard with `@RequirePermissions('organization:create')`.
3. Delegate to existing `AdminOrgDatabaseRepository.findBySlug()`.
4. Return `{ data: { available: boolean } }`.

#### Files
- `src/modules/admin/organizations/api/controllers/admin-organizations.controller.ts`
- `src/modules/admin/organizations/api/controllers/admin-organizations.controller.spec.ts`

#### Expected outcome
Slug availability is checked through a DB-guarded endpoint with `organization:create` permission.

#### Tests
1. Returns `{ available: true }` when slug is free.
2. Returns `{ available: false }` when slug is taken.
3. Returns 403 when user lacks `organization:create` permission.
4. Validates slug format (reuse existing `slugRegex`).
5. Frontend `organizationService.checkSlug` uses the guarded backend endpoint instead of Better Auth.

### 4.5 Workstream 5: Frontend cutover to DB-guarded endpoints
**Objective:** Replace only the remaining FE privileged Better Auth usage that is safe to cut over in this phase.

**Depends on:** Workstream 4 (slug-check endpoint must exist).

#### Changes in `spa-ampliri`

**Slug-check cutover** (`src/features/Admin/services/adminService.ts`):
1. Replace `organization.checkSlug({ slug })` (~line 665) with `fetchWithAuth` call to `GET /api/platform-admin/organizations/check-slug?slug=<value>`.
2. Update `useCheckSlug` hook tests accordingly.
3. Keep the current impersonation split in this phase:
   - admin path via Better Auth
   - manager path via org-scoped custom endpoint
4. Do **not** remove `impersonation_mode` branching in this phase.

**Preserve Better Auth usage for non-privileged operations:**
- `organization.setActive()` — keep
- `organization.acceptInvitation()` / `rejectInvitation()` — keep
- `organization.getFullOrganization()` — keep
- `organization.removeMember()` / `addMember()` — keep (non-privileged org mechanics)

#### Expected outcome
Slug-check no longer depends on Better Auth, while impersonation remains on the current split path until a backend redesign is approved.

#### Tests
1. `organizationService.checkSlug` calls guarded backend endpoint.
2. `useCheckSlug` continues to surface available/taken state correctly.
3. Existing admin and manager impersonation flows continue to work unchanged.
4. Slug check in OrganizationsPage still shows available/taken status.

### 4.6 Workstream 6: Better Auth compatibility verification
**Objective:** Confirm Better Auth remains fully functional for auth/session/org mechanics after all changes.

**Depends on:** Workstreams 1-5 complete.

#### Verification (no code changes expected)
1. `src/permissions.ts` remains as-is — it is required by Better Auth's admin plugin for auth compatibility.
2. `src/auth.ts` plugin wiring remains as-is.
3. No route blocking of `/api/auth/*` — Better Auth handles authentication and session endpoints there.
4. Confirm the remaining Better Auth usage in the FE is limited to authentication/session/org mechanics and the intentionally retained admin impersonation path.

#### Expected outcome
Better Auth continues to handle authentication, sessions, and organization membership without interference from RBAC changes.

## 5. Public API Changes

### 5.1 New endpoint
| Method | Path | Guard | Permission | Purpose |
|---|---|---|---|---|
| GET | `/api/platform-admin/organizations/check-slug` | `RolesGuard + PermissionsGuard` | `organization:create` | Slug availability check |

### 5.2 Changed endpoints
| Method | Path | Change | Impact |
|---|---|---|---|
| GET | `/api/rbac/my-permissions` | Admin now returns DB-derived permissions instead of all permissions | None if seed is correct (admin has all perms in DB) |

### 5.3 Existing endpoints (no changes, already DB-guarded)
| Method | Path | Permission |
|---|---|---|
| POST | `/api/organization/:orgId/impersonate` | `user:impersonate` |
| POST | `/api/organization/stop-impersonating` | (none — must be accessible to impersonated user) |

### 5.4 Internal interface changes
1. No breaking external auth/session interface.
2. `PermissionsGuard` no longer bypasses admin — admin requires DB grants.
3. RBAC test fixtures must assume admin is data-driven, not bypassed.
4. Admin impersonation remains on its existing Better Auth path until a separate backend contract redesign lands.

## 6. Test Strategy (Regression Elimination)

### 6.1 Backend unit tests
#### Existing (641 passing)
All existing tests must continue to pass. Key areas to verify after changes:
- `PermissionsGuard` spec — update to remove admin-bypass expectations, add DB-driven admin cases.
- `RbacController` spec — update `getMyPermissions` admin case to expect DB-derived response.
- `AdminOrganizationsController` spec — add slug-check endpoint tests.
- Migration specs — keep existing `rbac_006_assign_all_permissions_to_admin` coverage and add `rbac_007_remove_session_delete_permission` idempotency tests.

#### New test cases
1. `PermissionsGuard` denies admin when DB lacks required permission.
2. `PermissionsGuard` allows admin when DB grants required permission.
3. `PermissionsGuard` multi-permission requires all.
4. `getMyPermissions` returns DB-derived list for admin (not `findAll()`).
5. `getMyPermissions` returns DB-derived list for manager (unchanged role contract).
6. Slug-check returns `{ available: true/false }` and validates format.
7. Slug-check returns 403 without `organization:create`.
8. `rbac_007_remove_session_delete_permission` removes `session:delete` and is idempotent.
9. Existing `rbac_006_assign_all_permissions_to_admin` coverage remains green and continues to prove admin backfill safety.

### 6.2 Frontend unit tests (Vitest + RTL)
#### Existing (356 passing)
All existing tests must continue to pass. Key areas to verify after changes:
- `adminService.organizationService.test.ts` — update `checkSlug` to assert guarded endpoint.
- `useOrganizations.test.tsx` — update `useCheckSlug` hook test.
- Existing impersonation tests should remain green without changing the admin Better Auth path in this phase.

#### New test cases
1. `organizationService.checkSlug` calls `/api/platform-admin/organizations/check-slug`.
2. `useCheckSlug` preserves available/taken behavior.

### 6.3 Playwright E2E tests
#### Compatibility suite (must still pass)
1. Login/logout/session refresh.
2. Organization set-active.
3. Invitation accept/reject.
4. Leave organization.
5. Navigation integrity (dashboard redirects).

#### RBAC contract suite (existing + new)
1. Admin/manager/member page access matrix.
2. Admin/manager/member action visibility matrix.
3. Impersonation flow works for allowed actor, blocked for disallowed actor.
4. Slug-check follows `organization:create` permission.
5. Role hierarchy filtering (managers see only roles below their level).

### 6.4 Contract parity verification
1. Every `@RequirePermissions` key in BE must exist in `permissions` DB table.
2. Every `can('resource', 'action')` call in FE must correspond to a `@RequirePermissions` in BE.
3. No orphan permission keys in DB that are unused by any guard or FE check (except explicit allowlist).

## 7. CI and Quality Gates

### Mandatory jobs
1. `backend-unit` — Jest unit tests (target: 641+ passing)
2. `frontend-unit` — Vitest unit tests (target: 356+ passing)
3. `playwright-e2e` — E2E compatibility and RBAC contract tests

### Future additions (when infrastructure supports it)
4. `backend-integration-postgres` — real DB integration tests
5. `permissions-contract-check` — automated parity verification

### Merge policy
1. All active jobs required to pass.
2. No bypass for protected branches.
3. Flaky tests quarantined only with explicit issue and temporary expiration.

## 8. Risk Register and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Admin lockout after guard bypass removal | **Critical** | Workstream 1 runs first: validate/deploy existing `rbac_006_assign_all_permissions_to_admin` before bypass removal. Emergency rollback: re-add bypass line in `PermissionsGuard`. |
| Admin impersonation regression from premature endpoint unification | **High** | Do not cut admin impersonation over in this phase. Keep Better Auth for the admin path until the backend impersonation contract is redesigned and validated. |
| `my-permissions` returns fewer perms for admin after change | **High** | Workstream 1 ensures admin `role_permissions` are complete. If a new permission is added to `permissions` table, add or extend a tracked migration to preserve the invariant. |
| Seed/migration drift reintroduced | **Medium** | Contract parity check in CI. Idempotent migration pattern for all new migrations. |
| FE stale permission UX after DB permission change | **Medium** | Already mitigated: deny-by-default in `PermissionsContext` + explicit refetch on role-permission mutations. |
| E2E test brittleness | **Medium** | Dedicated test data setup/teardown, deterministic fixtures, single-worker Playwright config. |

## 9. Rollout Plan

### Phase 1: Backend safety + hardening
1. Validate or deploy existing `rbac_006_assign_all_permissions_to_admin`, and deploy `rbac_007_remove_session_delete_permission`.
2. Verify admin role has all permissions in live DB and `session:delete` is removed from live deployments.
3. Deploy Workstream 2 (guard bypass removal) + Workstream 3 (my-permissions alignment).
4. Monitor 401/403 metrics by endpoint/role — no new 403s for admin.

### Phase 2: New endpoint + FE cutover
5. Deploy Workstream 4 (slug-check endpoint).
6. Deploy Workstream 5 (FE slug-check cutover only).
7. Run full E2E suite. Verify slug-check works through the custom endpoint and existing impersonation flows remain stable.

### Phase 3: Verification
8. Run Workstream 6 verification (Better Auth compatibility).
9. Run contract parity check.
10. Confirm zero drift between BE guards, FE `can()` calls, and DB permissions.
11. Scope any future admin impersonation unification as a separate design and delivery phase.

## 10. Definition of Done
1. `PermissionsGuard` resolves permissions from DB for **all roles** including admin — no bypass.
2. `GET /api/rbac/my-permissions` returns DB-derived permissions via `roleService.getUserPermissions()` for all currently allowed roles.
3. `GET /api/platform-admin/organizations/check-slug` exists and is guarded by `organization:create`.
4. FE slug-check uses custom DB-guarded endpoint.
5. Existing admin and manager impersonation flows continue to work without contract regression.
6. `session:delete` removed from live DB and seed definitions.
7. Better Auth still functions for authentication, sessions, and organization membership mechanics.
8. All unit tests pass (BE 641+, FE 356+).
9. All Playwright E2E tests pass.
10. No regression in existing functionality.
11. Admin impersonation unification is explicitly deferred until a backend contract redesign is approved.

## 11. Assumptions and Defaults
1. Better Auth remains the authentication/session foundation — do not remove or block its endpoints.
2. `src/permissions.ts` is kept as Better Auth compatibility config — it is NOT the authorization source of truth.
3. Privileged authorization is fully DB-authoritative via `role_permissions` table.
4. Permission checks are immediate (no cache layer) — DB is queried on every guarded request.
5. System roles (`admin`, `manager`, `member`) are normalized by migration; custom roles are preserved.
6. Frontend uses `GET /api/rbac/my-permissions` as the canonical input for all `can()` permission gating.
7. The `admin` role is expected to have ALL permissions. Existing `rbac_006_assign_all_permissions_to_admin` ensures this invariant before guard hardening.
