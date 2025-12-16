-- Migration: Unify Role Model
-- This migration updates the role system to use a unified 3-role model:
-- - admin: Global platform administrator
-- - manager: Organization manager (replaces moderator/owner)
-- - member: Organization member (replaces user)

-- Step 1: Update existing roles table
-- Rename 'moderator' to 'manager' and update description
UPDATE roles 
SET name = 'manager', 
    display_name = 'Manager',
    description = 'Organization manager with full access within their assigned organization',
    color = 'blue',
    is_system = true
WHERE name = 'moderator';

-- Rename 'user' to 'member' and update description
UPDATE roles 
SET name = 'member', 
    display_name = 'Member',
    description = 'Organization member with basic access within their assigned organization',
    color = 'gray',
    is_system = true
WHERE name = 'user';

-- Update admin role description
UPDATE roles 
SET description = 'Global platform administrator with full access to all organizations and settings'
WHERE name = 'admin';

-- Step 2: Update user.role column for existing users
-- Map 'user' -> 'member', 'moderator' -> 'manager'
UPDATE "user" SET role = 'member' WHERE role = 'user';
UPDATE "user" SET role = 'manager' WHERE role = 'moderator';

-- Step 3: Update organization member roles
-- Map Better Auth org roles to unified model:
-- 'owner' -> 'admin' (org admin)
-- 'admin' -> 'manager' (org manager)  
-- 'member' -> 'member' (no change)
UPDATE member SET role = 'admin' WHERE role = 'owner';
UPDATE member SET role = 'manager' WHERE role = 'admin' AND role != 'admin';

-- Note: Run this migration manually or via a migration tool
-- After running, restart the application to apply new seed data
