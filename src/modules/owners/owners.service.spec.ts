import { NotFoundException } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { OwnersRepo } from './owners.repo';
import { OwnerProvisioningService } from './owner-provisioning.service';

describe('OwnersService', () => {
  let ownersRepo: {
    list: jest.Mock;
    findByIdWithPartySummary: jest.Mock;
    update: jest.Mock;
  };
  let ownerProvisioningService: {
    createOrReuseOwner: jest.Mock;
  };
  let service: OwnersService;

  beforeEach(() => {
    ownersRepo = {
      list: jest.fn(),
      findByIdWithPartySummary: jest.fn(),
      update: jest.fn(),
    };
    ownerProvisioningService = {
      createOrReuseOwner: jest.fn(),
    };

    service = new OwnersService(
      ownersRepo as unknown as OwnersRepo,
      ownerProvisioningService as unknown as OwnerProvisioningService,
    );
  });

  it('updates an owner within the current org scope', async () => {
    ownersRepo.findByIdWithPartySummary
      .mockResolvedValueOnce({
        id: 'owner-1',
        orgId: 'org-1',
      })
      .mockResolvedValueOnce({
        id: 'owner-1',
        orgId: 'org-1',
        name: 'Updated Owner',
        email: 'updated@example.com',
        phone: '+971500000001',
        address: 'Dubai Marina',
        isActive: false,
      });
    ownersRepo.update.mockResolvedValue(undefined);

    const result = await service.update(
      { sub: 'admin-1', orgId: 'org-1', email: 'admin@example.com' },
      'owner-1',
      {
        name: 'Updated Owner',
        email: 'Updated@Example.com',
        phone: '+971500000001',
        address: 'Dubai Marina',
        isActive: false,
      },
    );

    expect(ownersRepo.update).toHaveBeenCalledWith('owner-1', {
      name: 'Updated Owner',
      email: 'updated@example.com',
      phone: '+971500000001',
      address: 'Dubai Marina',
      isActive: false,
    });
    expect(result).toMatchObject({
      id: 'owner-1',
      orgId: 'org-1',
      name: 'Updated Owner',
      email: 'updated@example.com',
      isActive: false,
    });
  });

  it('rejects updates for owners outside the current org scope', async () => {
    ownersRepo.findByIdWithPartySummary.mockResolvedValue({
      id: 'owner-1',
      orgId: 'org-2',
    });

    await expect(
      service.update(
        { sub: 'admin-1', orgId: 'org-1', email: 'admin@example.com' },
        'owner-1',
        { name: 'Updated Owner' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(ownersRepo.update).not.toHaveBeenCalled();
  });
});
