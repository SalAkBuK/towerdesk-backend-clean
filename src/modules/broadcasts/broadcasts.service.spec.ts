import { BroadcastsService } from './broadcasts.service';
import { BroadcastAudience } from './broadcasts.constants';
import { toBroadcastResponse } from './dto/broadcast.response.dto';

describe('BroadcastsService', () => {
  const broadcastsRepo = {
    findById: jest.fn(),
    list: jest.fn(),
    getOrgBuildingIds: jest.fn(),
    getUserBuildingIdsWithPermission: jest.fn(),
    getActiveResidentUserIds: jest.fn(),
    getBuildingAssignmentUserIds: jest.fn(),
    getAdminUserIds: jest.fn(),
    getActiveOrgUserIds: jest.fn(),
    create: jest.fn(),
  };
  const broadcastDeliveryService = {
    enqueueFanout: jest.fn(),
  };
  const buildingAccessService = {
    assertBuildingInOrg: jest.fn(),
  };
  const accessControlService = {
    getUserEffectivePermissions: jest.fn(),
  };

  let service: BroadcastsService;

  beforeEach(() => {
    jest.clearAllMocks();
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set<string>(),
    );
    broadcastsRepo.getOrgBuildingIds.mockResolvedValue(['building-1']);
    broadcastsRepo.findById.mockResolvedValue({
      id: 'broadcast-1',
      orgId: 'org-1',
      senderUserId: 'sender-1',
      title: 'Notice',
      body: 'Hello',
      buildingIds: ['building-2'],
      recipientCount: 1,
      metadata: null,
      senderUser: {
        id: 'sender-1',
        name: 'Sender One',
        email: 'sender-1@test.com',
      },
    });
    broadcastsRepo.list.mockResolvedValue([
      {
        id: 'broadcast-1',
        orgId: 'org-1',
        title: 'Notice',
        body: 'Hello',
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        buildingIds: ['building-2'],
        recipientCount: 1,
        metadata: null,
        senderUser: {
          id: 'sender-1',
          name: 'Sender One',
          email: 'sender-1@test.com',
        },
      },
    ]);
    broadcastsRepo.getUserBuildingIdsWithPermission.mockResolvedValue([
      'building-2',
    ]);
    broadcastsRepo.getActiveResidentUserIds.mockResolvedValue(['resident-1']);
    broadcastsRepo.getBuildingAssignmentUserIds.mockResolvedValue([]);
    broadcastsRepo.getAdminUserIds.mockResolvedValue([]);
    broadcastsRepo.getActiveOrgUserIds.mockResolvedValue(['resident-1']);
    broadcastsRepo.create.mockResolvedValue({
      id: 'broadcast-1',
      orgId: 'org-1',
      senderUserId: 'sender-1',
      title: 'Notice',
      body: 'Hello',
      buildingIds: ['building-1'],
      recipientCount: 1,
      metadata: {
        audiences: [BroadcastAudience.TENANTS],
        scope: 'org_wide',
        buildingCount: 1,
        audienceSummary: 'Tenants',
      },
      senderUser: {
        id: 'sender-1',
        name: 'Sender One',
        email: 'sender-1@test.com',
      },
    });
    broadcastDeliveryService.enqueueFanout.mockResolvedValue(undefined);

    service = new BroadcastsService(
      broadcastsRepo as never,
      buildingAccessService as never,
      accessControlService as never,
      broadcastDeliveryService as never,
    );
  });

  it('treats org-scoped broadcasts.write as org-wide access', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(['broadcasts.write']),
    );

    await service.createBroadcast(
      { sub: 'sender-1', orgId: 'org-1' },
      'org-1',
      {
        title: 'Notice',
        body: 'Hello',
        audiences: [BroadcastAudience.TENANTS],
      },
    );

    expect(broadcastsRepo.getOrgBuildingIds).toHaveBeenCalledWith('org-1');
    expect(
      broadcastsRepo.getUserBuildingIdsWithPermission,
    ).not.toHaveBeenCalled();
    expect(broadcastsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        buildingIds: ['building-1'],
        metadata: {
          audiences: [BroadcastAudience.TENANTS],
          scope: 'org_wide',
          buildingCount: 1,
          audienceSummary: 'Tenants',
        },
      }),
    );
  });

  it('uses building-scoped broadcasts.write to limit accessible buildings', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );
    buildingAccessService.assertBuildingInOrg.mockResolvedValue(undefined);

    await service.createBroadcast(
      { sub: 'sender-1', orgId: 'org-1' },
      'org-1',
      {
        title: 'Notice',
        body: 'Hello',
        buildingIds: ['building-2'],
        audiences: [BroadcastAudience.TENANTS],
      },
    );

    expect(
      broadcastsRepo.getUserBuildingIdsWithPermission,
    ).toHaveBeenCalledWith('sender-1', 'org-1', 'broadcasts.write');
    expect(buildingAccessService.assertBuildingInOrg).toHaveBeenCalledWith(
      'building-2',
      'org-1',
    );
    expect(broadcastDeliveryService.enqueueFanout).toHaveBeenCalledWith({
      broadcastId: 'broadcast-1',
      orgId: 'org-1',
      userIds: ['resident-1'],
      title: 'Notice',
      body: 'Hello',
      senderUserId: 'sender-1',
      buildingIds: ['building-2'],
      metadata: {
        broadcastId: 'broadcast-1',
        buildingIds: ['building-2'],
        senderUserId: 'sender-1',
        metadata: {
          audiences: [BroadcastAudience.TENANTS],
          scope: 'single_building',
          buildingCount: 1,
          audienceSummary: 'Tenants',
        },
      },
    });
  });

  it('filters broadcast reads to buildings where the user has broadcasts.read', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );

    const broadcast = await service.getBroadcast(
      { sub: 'sender-1', orgId: 'org-1' },
      'org-1',
      'broadcast-1',
    );

    expect(
      broadcastsRepo.getUserBuildingIdsWithPermission,
    ).toHaveBeenCalledWith('sender-1', 'org-1', 'broadcasts.read');
    expect(broadcast).toEqual(
      expect.objectContaining({
        id: 'broadcast-1',
      }),
    );
  });

  it('limits broadcast listings to readable buildings for building-scoped users', async () => {
    accessControlService.getUserEffectivePermissions.mockResolvedValue(
      new Set(),
    );

    await service.listBroadcasts(
      { sub: 'sender-1', orgId: 'org-1' },
      'org-1',
      {},
    );

    expect(broadcastsRepo.list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        buildingIds: ['building-2'],
      }),
    );
  });

  it('returns fallback metadata for legacy broadcasts without persisted metadata', () => {
    const response = toBroadcastResponse({
      id: 'broadcast-legacy',
      title: 'Legacy Notice',
      body: null,
      buildingIds: ['building-1', 'building-2'],
      recipientCount: 12,
      metadata: null,
      createdAt: new Date('2026-04-04T00:00:00.000Z'),
      senderUser: {
        id: 'sender-1',
        name: 'Sender One',
        email: 'sender-1@test.com',
      },
    });

    expect(response.metadata).toEqual({
      audiences: [],
      scope: 'multi_building',
      buildingCount: 2,
      audienceSummary: 'Recipients',
    });
  });
});
