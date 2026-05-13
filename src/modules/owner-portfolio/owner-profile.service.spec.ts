import { NotFoundException } from '@nestjs/common';
import { OwnerProfileService } from './owner-profile.service';

describe('OwnerProfileService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    ownerAccessGrant: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    owner: {
      update: jest.Mock;
    };
  };
  let service: OwnerProfileService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      ownerAccessGrant: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      owner: {
        update: jest.fn(),
      },
    };

    service = new OwnerProfileService(prisma as never);
  });

  it('returns owner me payload with accessible owner profiles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Jane Owner',
      avatarUrl: 'https://files.example/avatar.jpg',
      phone: '+971500000001',
    });
    prisma.ownerAccessGrant.findMany.mockResolvedValue([
      {
        ownerId: 'owner-1',
        owner: {
          id: 'owner-1',
          org: { id: 'org-1', name: 'Org One' },
          name: 'Jane Owner',
          email: 'owner@example.com',
          phone: '+971500000001',
          address: 'Dubai',
          isActive: true,
        },
      },
      {
        ownerId: 'owner-1',
        owner: {
          id: 'owner-1',
          org: { id: 'org-1', name: 'Org One' },
          name: 'Jane Owner',
          email: 'owner@example.com',
          phone: '+971500000001',
          address: 'Dubai',
          isActive: true,
        },
      },
    ]);

    const result = await service.getMe('user-1');

    expect(result.user.email).toBe('owner@example.com');
    expect(result.owners).toEqual([
      {
        ownerId: 'owner-1',
        orgId: 'org-1',
        orgName: 'Org One',
        name: 'Jane Owner',
        email: 'owner@example.com',
        phone: '+971500000001',
        address: 'Dubai',
        isActive: true,
      },
    ]);
  });

  it('updates owner account profile fields', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Jane Updated',
      avatarUrl: 'https://files.example/new-avatar.jpg',
      phone: '+971500000009',
    });

    const result = await service.updateAccountProfile('user-1', {
      name: 'Jane Updated',
      avatarUrl: 'https://files.example/new-avatar.jpg',
      phone: '+971500000009',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        name: 'Jane Updated',
        avatarUrl: 'https://files.example/new-avatar.jpg',
        phone: '+971500000009',
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        phone: true,
      },
    });
    expect(result.name).toBe('Jane Updated');
  });

  it('rejects owner profile updates outside current owner access scope', async () => {
    prisma.ownerAccessGrant.findFirst.mockResolvedValue(null);

    await expect(
      service.updateOwnerProfile('user-1', 'owner-9', {
        phone: '+971500000001',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
