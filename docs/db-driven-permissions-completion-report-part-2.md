# DB-Driven Permissions Completion Report Part 2

This report defines the implementation-ready second phase of the DB-driven permissions rollout: unifying admin and manager impersonation on a custom backend contract while preserving Better Auth compatibility, enforcing strict TDD, and minimizing regression risk.

## 1. Goal

Finish the remaining privileged impersonation gap identified in Part 1 by replacing the frontend’s admin Better Auth impersonation path with a custom DB-guarded backend flow whose authorization source of truth is the `user:impersonate` permission, while preserving the current domain constraints applied to the supported actor types.

## 1.1 Authorization model invariant

Impersonation does **not** depend on a role name by itself. It depends on the `user:impersonate` permission. Roles are only bundles of permissions. Where this report references `admin` or `manager`, that is describing the current system-role groupings and domain constraints that shape who they may impersonate and in which organization context.

## 2. Scope

### In scope

1. Add a new unified impersonation start endpoint under the admin/users domain.
2. Introduce or extract a shared backend impersonation service that enforces permission-led impersonation plus the existing actor/target domain constraints.
3. Reuse the existing custom stop-impersonation endpoint for all currently supported impersonation actor types.
4. Cut the SPA admin impersonation flow over from Better Auth admin client calls to the new custom backend endpoint.
5. Keep the current manager impersonation flow behaviorally intact while moving the supported impersonation actors onto one backend contract.
6. Add strict TDD coverage and focused regression verification.

### Out of scope

1. Do not replace Better Auth as the auth/session foundation.
2. Do not replace `/api/auth/*` endpoints.
3. Do not change non-privileged Better Auth organization mechanics.
4. Do not widen impersonation access beyond the current permission model and actor/target rules.
5. Do not refactor unrelated RBAC, auth, or invitation flows.

## 3. Current State Summary

### Current backend behavior

1. Manager impersonation uses:
   - `POST /api/organization/:organizationId/impersonate`
   - guarded by `RolesGuard + PermissionsGuard`
   - requires `user:impersonate`
   - is currently limited to the system-role groups allowed by the route and service
2. The org-scoped service creates a session row directly with:
   - `userId = targetUserId`
   - `impersonatedBy = actorUserId`
   - `activeOrganizationId = organizationId`
3. Stop impersonation already works through:
   - `POST /api/organization/stop-impersonating`
   - deletes the current impersonated session by bearer token

### Current frontend behavior

1. Manager start flow already uses the custom backend endpoint and swaps bearer tokens locally.
2. Admin start flow still uses Better Auth client:
   - `admin.impersonateUser()`
3. Admin stop flow still uses Better Auth client in some branches:
   - `admin.stopImpersonating()`
4. The SPA stores:
   - `original_bearer_token`
   - `bearer_token`
   - `impersonation_mode`

### Key incompatibility preventing naive unification

The existing org-scoped start endpoint is **not** a valid unified admin start contract, because `OrgImpersonationService.impersonateUser()` requires the actor to be a member of the target organization. That is correct for managers, but it would reject a platform admin impersonating a valid non-admin target outside org membership.

## 4. Better Auth Compatibility Boundary

### Better Auth MUST continue to own

1. Authentication
   - login
   - signup
   - password reset
   - email verification
2. Base session/auth infrastructure
   - bearer/session parsing
   - auth plugin wiring in `src/auth.ts`
3. Organization-member mechanics
   - `organization.setActive()`
   - invitation acceptance/rejection
   - membership helper flows still backed by Better Auth

### This phase MAY replace only

1. Frontend admin impersonation initiation via Better Auth admin client.
2. Frontend admin stop impersonation branch via Better Auth admin client.

### Compatibility invariant

The implementation must continue using the existing Better Auth-backed session foundation while moving the **privileged authorization and impersonation-session creation decision** into a custom backend flow.

## 5. Target Architecture

### 5.1 New unified start endpoint

Add a new endpoint:

- `POST /api/admin/users/:userId/impersonate`

#### Request body

```json
{
  "organizationId": "optional-org-id"
}
```

#### Guarding

- `@UseGuards(RolesGuard, PermissionsGuard)`
- `@Roles('admin', 'manager')`
- `@RequirePermissions('user:impersonate')`

Implementation note:

- `@Roles('admin', 'manager')` describes the currently supported system-role groups at the route boundary.
- `@RequirePermissions('user:impersonate')` remains the actual authorization source of truth for impersonation access.

#### Response shape

```json
{
  "success": true,
  "sessionToken": "new-impersonation-session-token"
}
```

### 5.2 Shared impersonation service

Create or extract a backend service responsible for:

1. Resolving actor context from session:
   - `actorUserId`
   - `platformRole`
   - `activeOrganizationId`
2. Resolving target context:
   - target platform role
   - target organization memberships
3. Enforcing the permission-first model:
   - route/controller access is gated by `user:impersonate`
   - platform role is used only to apply the current domain constraints on eligible targets and organization scoping
4. Applying the current domain constraints:
   - admin-group actors may impersonate non-admin, non-self targets
   - manager-group actors may impersonate member, non-self targets in active org only
5. Creating the impersonated session row with:
   - `token`
   - `userId = targetUserId`
   - `impersonatedBy = actorUserId`
   - `activeOrganizationId = resolved organization context`

### 5.3 Stop flow

Reuse the existing custom stop endpoint:

- `POST /api/organization/stop-impersonating`

Unified expected behavior:

1. Call stop endpoint using the impersonated bearer token.
2. Delete only sessions where `impersonatedBy` is set.
3. Restore `original_bearer_token` on the frontend.
4. Refresh session and invalidate cached queries.

## 6. Organization Context Resolution Rules

This part is mandatory and must be implemented deterministically.

### Manager rules

1. `organizationId` must be present or derivable from the actor’s active org.
2. The manager may impersonate only a `member` in that same active organization.
3. Any mismatch must fail with a clear forbidden error.

### Admin rules

Use the following default policy for this phase:

1. If request body includes `organizationId`:
   - verify the target belongs to that organization
   - use that organization as the impersonated session context
2. If request body omits `organizationId` and the target belongs to exactly one organization:
   - derive it automatically
3. If request body omits `organizationId` and the target belongs to multiple organizations:
   - reject with a clear validation error requiring explicit org selection
4. If the target belongs to no organization:
   - reject unless the SPA explicitly supports a null-org impersonated experience

### Default decision for implementation

For LLM implementation, assume:

- **multi-org admin targets require explicit org selection**

This is the safest default and should be treated as the implementation baseline unless the user overrides it later.

## 7. Public API Changes

### New endpoint

| Method | Path | Guard | Permission | Purpose |
|---|---|---|---|---|
| POST | `/api/admin/users/:userId/impersonate` | `RolesGuard + PermissionsGuard` | `user:impersonate` | Unified admin/manager impersonation start |

### Existing endpoint reused

| Method | Path | Change |
|---|---|---|
| POST | `/api/organization/stop-impersonating` | No contract change; now used as the canonical stop flow for both admin and manager |

## 8. Files Likely To Change

### Backend

- `src/modules/admin/users/api/controllers/admin-users.controller.ts`
- `src/modules/admin/users/api/controllers/admin-users.controller.spec.ts`
- new shared impersonation service in admin domain, or extracted service under users/organizations application services
- supporting repository queries for target memberships / org resolution
- tests for service behavior and edge cases

### Frontend

- `src/features/Admin/services/adminService.ts`
- `src/features/Admin/services/__tests__/adminService.impersonation.test.ts`
- potentially `src/features/Admin/hooks/__tests__/useUsers.test.tsx`
- Playwright impersonation coverage for admin and manager

## 9. TDD Implementation Plan

### Step 1 — Backend failing tests first

Add failing tests for the new unified start flow:

1. admin can impersonate a non-admin target
2. admin cannot impersonate self
3. admin cannot impersonate another admin
4. manager can impersonate member in active org
5. manager cannot impersonate target outside active org
6. multi-org admin target without `organizationId` fails clearly
7. explicit `organizationId` succeeds when target belongs to that org

### Step 2 — Minimal backend implementation

Implement the new controller and shared impersonation service to satisfy only the failing tests.

### Step 3 — Frontend failing tests first

Add failing SPA unit tests proving:

1. admin impersonation start uses custom backend endpoint instead of Better Auth client
2. admin stores `original_bearer_token`
3. unified stop flow restores original token through custom stop endpoint semantics
4. Better Auth-specific admin stop branch is no longer required after cutover

### Step 4 — Focused Playwright failing tests

Add or tighten admin impersonation E2E coverage:

1. admin impersonates allowed target
2. banner appears
3. stop impersonating is visible
4. stop restores admin session
5. manager impersonation flow still passes unchanged

### Step 5 — Minimal frontend implementation

Cut the admin start/stop flow over only after failing tests exist.

### Step 6 — Verification gate

Re-run the smallest focused checks first, then the broader impersonation regression slice.

## 10. Regression Strategy

### Mandatory focused checks

1. Backend unit tests for unified impersonation service/controller
2. Frontend unit tests for `adminService.impersonation`
3. Focused Playwright admin impersonation flow
4. Existing manager impersonation Playwright flow

### Broader regression slice

After focused checks pass, run the smallest broader suite covering:

1. impersonation flows
2. users page action visibility/capability matrix
3. session restore behavior
4. permission-based admin/manager access control around impersonation

### Rollback safety

Until all focused tests are green:

1. preserve `original_bearer_token` restore logic
2. avoid removing fallback local markers prematurely
3. do not delete existing manager stop behavior
4. cut over admin start path only after backend contract is proven green

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Admin impersonation fails for users outside org membership | High | Do not reuse the current org-scoped start endpoint for admin; use the new unified start endpoint |
| Multi-org ambiguity causes wrong impersonated org context | High | Require explicit `organizationId` when target belongs to multiple orgs |
| Stop flow leaves user stuck impersonating | Critical | Preserve token restore flow and verify stop path with focused E2E before removing old admin branch |
| Hidden Better Auth assumptions around admin impersonation | High | Keep Better Auth session foundation intact and verify custom flow with unit + Playwright tests before deleting old client usage |
| Regression in manager impersonation | High | Keep manager Playwright flow green throughout the migration |

## 12. Definition of Done

1. Admin and manager both start impersonation through the custom backend contract.
2. Authorization rules remain unchanged from today’s capabilities model.
3. Better Auth remains the authentication/session foundation.
4. The unified stop flow works for both admin and manager.
5. Admin impersonation no longer depends on `admin.impersonateUser()` in the SPA.
6. Focused backend and frontend unit tests pass.
7. Focused Playwright admin impersonation test passes.
8. Existing manager impersonation regression test passes.
9. No regression in banner visibility, stop flow, or session restoration.

## 13. Implementation Notes For Another LLM

1. Prefer extracting shared impersonation policy into one service rather than duplicating admin and manager logic in controllers.
2. Reuse current capability semantics from the users domain instead of inventing new authorization rules.
3. Keep diffs small and avoid changing unrelated Better Auth integration.
4. Do not remove fallback/local restore behavior until tests prove the unified flow is stable.
5. Treat explicit org selection for multi-org admin targets as required behavior in this phase.
