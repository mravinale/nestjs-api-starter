-- ============================================================================
-- Create Test Admin User Migration
-- ============================================================================
-- This migration creates a test admin user for development/testing.
-- 
-- User: test@example.com / password123
-- Role: admin
--
-- Run with: psql -d your_database -f 002_create_test_admin.sql
-- ============================================================================

-- Create test admin user (password: password123)
-- Note: The password hash is for 'password123' using bcrypt
INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
VALUES (
    'test-admin-user-id',
    'Test Admin',
    'test@example.com',
    true,
    'admin',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO UPDATE SET
    role = 'admin',
    "emailVerified" = true;

-- Create account with password (bcrypt hash of 'password123')
-- This hash was generated with bcrypt cost factor 10
INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
VALUES (
    'test-admin-account-id',
    'test@example.com',
    'credential',
    'test-admin-user-id',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.Y1YQVz/VlGPxZGJHKy',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

SELECT 'Test admin user created: test@example.com / password123' AS status;
