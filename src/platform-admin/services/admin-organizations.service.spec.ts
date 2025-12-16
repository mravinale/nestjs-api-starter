import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminOrganizationsService } from './admin-organizations.service';
import { DatabaseService } from '../../database';

describe('AdminOrganizationsService', () => {
  let service: AdminOrganizationsService;
  let dbService: jest.Mocked<DatabaseService>;

  const mockOrganization = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    logo: null,
    metadata: null,
    created_at: new Date(),
    member_count: '5',
  };

  beforeEach(async () => {
    const mockDbService = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrganizationsService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<AdminOrganizationsService>(AdminOrganizationsService);
    dbService = module.get(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated organizations', async () => {
      dbService.queryOne.mockResolvedValue({ count: '10' });
      dbService.query.mockResolvedValue([mockOrganization]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Test Org');
      expect(result.data[0].memberCount).toBe(5);
    });

    it('should apply search filter', async () => {
      dbService.queryOne.mockResolvedValue({ count: '1' });
      dbService.query.mockResolvedValue([mockOrganization]);

      await service.findAll({ page: 1, limit: 20, search: 'test' });

      expect(dbService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['%test%'],
      );
    });

    it('should handle empty results', async () => {
      dbService.queryOne.mockResolvedValue({ count: '0' });
      dbService.query.mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return organization with member count', async () => {
      dbService.queryOne.mockResolvedValue(mockOrganization);

      const result = await service.findById('org-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('org-1');
      expect(result?.memberCount).toBe(5);
    });

    it('should return null for non-existent organization', async () => {
      dbService.queryOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update organization name', async () => {
      dbService.queryOne
        .mockResolvedValueOnce(mockOrganization) // findById
        .mockResolvedValueOnce({ ...mockOrganization, name: 'Updated Org' }); // update

      const result = await service.update('org-1', { name: 'Updated Org' });

      expect(result?.name).toBe('Updated Org');
      expect(dbService.queryOne).toHaveBeenCalledTimes(2);
    });

    it('should return null for non-existent organization', async () => {
      dbService.queryOne.mockResolvedValue(null);

      const result = await service.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should return existing org if no updates provided', async () => {
      dbService.queryOne.mockResolvedValue(mockOrganization);

      const result = await service.update('org-1', {});

      expect(result?.id).toBe('org-1');
      expect(dbService.queryOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('should delete organization and related data', async () => {
      dbService.queryOne.mockResolvedValue(mockOrganization);
      dbService.transaction.mockImplementation(async (callback) => {
        const mockQuery = (async () => []) as (sql: string, params?: unknown[]) => Promise<unknown[]>;
        await callback(mockQuery);
        return undefined;
      });

      await service.delete('org-1');

      expect(dbService.transaction).toHaveBeenCalled();
    });

    it('should throw error for non-existent organization', async () => {
      dbService.queryOne.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow('Organization not found');
    });
  });

  describe('getMembers', () => {
    it('should return members with user info', async () => {
      const mockMember = {
        id: 'member-1',
        user_id: 'user-1',
        role: 'admin',
        created_at: new Date(),
        user_name: 'John Doe',
        user_email: 'john@example.com',
        user_image: null,
      };
      dbService.query.mockResolvedValue([mockMember]);

      const result = await service.getMembers('org-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].user.name).toBe('John Doe');
      expect(result[0].user.email).toBe('john@example.com');
    });
  });
});
