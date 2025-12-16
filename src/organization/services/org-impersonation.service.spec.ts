import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrgImpersonationService } from './org-impersonation.service';
import { DatabaseService } from '../../database';

describe('OrgImpersonationService', () => {
  let service: OrgImpersonationService;
  let dbService: jest.Mocked<DatabaseService>;

  const mockMembership = {
    id: 'member-1',
    user_id: 'user-1',
    organization_id: 'org-1',
    role: 'admin',
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockDbService = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgImpersonationService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<OrgImpersonationService>(OrgImpersonationService);
    dbService = module.get(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMembership', () => {
    it('should return membership when exists', async () => {
      dbService.queryOne.mockResolvedValue(mockMembership);

      const result = await service.getMembership('user-1', 'org-1');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-1');
      expect(result?.role).toBe('admin');
    });

    it('should return null when membership does not exist', async () => {
      dbService.queryOne.mockResolvedValue(null);

      const result = await service.getMembership('user-1', 'org-1');

      expect(result).toBeNull();
    });
  });

  describe('canImpersonate', () => {
    it('should return true for admin role', () => {
      expect(service.canImpersonate('admin')).toBe(true);
    });

    it('should return true for manager role', () => {
      expect(service.canImpersonate('manager')).toBe(true);
    });

    it('should return false for member role', () => {
      expect(service.canImpersonate('member')).toBe(false);
    });
  });

  describe('impersonateUser', () => {
    it('should allow manager to impersonate member in same org', async () => {
      const impersonatorMembership = { ...mockMembership, user_id: 'manager-1', role: 'admin' };
      const targetMembership = { ...mockMembership, user_id: 'user-1', role: 'member' };

      dbService.queryOne
        .mockResolvedValueOnce(impersonatorMembership)
        .mockResolvedValueOnce(targetMembership);
      dbService.query.mockResolvedValue([]);

      const result = await service.impersonateUser('manager-1', 'user-1', 'org-1');

      expect(result.sessionToken).toBeDefined();
      expect(dbService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO session'),
        expect.arrayContaining(['user-1', 'manager-1', 'org-1']),
      );
    });

    it('should deny impersonation if impersonator is not a member', async () => {
      dbService.queryOne.mockResolvedValue(null);

      await expect(
        service.impersonateUser('manager-1', 'user-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny impersonation if impersonator lacks manager role', async () => {
      const memberMembership = { ...mockMembership, role: 'member' };
      dbService.queryOne.mockResolvedValue(memberMembership);

      await expect(
        service.impersonateUser('member-1', 'user-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny impersonation if target is not in org', async () => {
      const impersonatorMembership = { ...mockMembership, role: 'admin' };
      dbService.queryOne
        .mockResolvedValueOnce(impersonatorMembership)
        .mockResolvedValueOnce(null);

      await expect(
        service.impersonateUser('manager-1', 'user-1', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should deny self-impersonation', async () => {
      const membership = { ...mockMembership, user_id: 'user-1', role: 'admin' };
      dbService.queryOne
        .mockResolvedValueOnce(membership)
        .mockResolvedValueOnce(membership);

      await expect(
        service.impersonateUser('user-1', 'user-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('stopImpersonation', () => {
    it('should delete impersonation session', async () => {
      dbService.queryOne.mockResolvedValue({ id: 'session-1', impersonated_by: 'manager-1' });
      dbService.query.mockResolvedValue([]);

      await service.stopImpersonation('token-123');

      expect(dbService.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM session'),
        ['token-123'],
      );
    });

    it('should throw if session not found', async () => {
      dbService.queryOne.mockResolvedValue(null);

      await expect(service.stopImpersonation('invalid-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw if session is not an impersonation session', async () => {
      dbService.queryOne.mockResolvedValue({ id: 'session-1', impersonated_by: null });

      await expect(service.stopImpersonation('token-123')).rejects.toThrow(ForbiddenException);
    });
  });
});
