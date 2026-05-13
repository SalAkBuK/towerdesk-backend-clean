import { BuildingScopeResolverService } from './building-scope-resolver.service';

describe('BuildingScopeResolverService', () => {
  it('resolves building scope from request body and query', async () => {
    const prisma = {};

    const service = new BuildingScopeResolverService(prisma as never);

    await expect(
      service.resolveForRequest(
        {
          query: { buildingId: 'building-query' },
        },
        'org-1',
      ),
    ).resolves.toBe('building-query');

    await expect(
      service.resolveForRequest(
        {
          body: { buildingId: 'building-body' },
        },
        'org-1',
      ),
    ).resolves.toBe('building-body');
  });

  it('resolves building scope from lease ids', async () => {
    const prisma = {
      lease: {
        findFirst: jest.fn().mockResolvedValue({ buildingId: 'building-1' }),
      },
    };

    const service = new BuildingScopeResolverService(prisma as never);

    const buildingId = await service.resolveForRequest(
      {
        params: { leaseId: 'lease-1' },
      },
      'org-1',
    );

    expect(prisma.lease.findFirst).toHaveBeenCalledWith({
      where: { id: 'lease-1', orgId: 'org-1' },
      select: { buildingId: true },
    });
    expect(buildingId).toBe('building-1');
  });

  it('resolves conversation ids through the conversations route family', async () => {
    const prisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ buildingId: 'building-7' }),
      },
    };

    const service = new BuildingScopeResolverService(prisma as never);

    const buildingId = await service.resolveForRequest(
      {
        params: { id: 'conversation-1' },
        baseUrl: '/org/conversations',
        route: { path: '/:id/messages' },
        originalUrl: '/org/conversations/conversation-1/messages',
      } as never,
      'org-1',
    );

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversation-1', orgId: 'org-1' },
      select: { buildingId: true },
    });
    expect(buildingId).toBe('building-7');
  });

  it('resolves move request ids using the current route family', async () => {
    const prisma = {
      moveInRequest: {
        findFirst: jest.fn().mockResolvedValue(undefined),
      },
      moveOutRequest: {
        findFirst: jest.fn().mockResolvedValue({ buildingId: 'building-9' }),
      },
      maintenanceRequest: {
        findFirst: jest.fn(),
      },
    };

    const service = new BuildingScopeResolverService(prisma as never);

    const buildingId = await service.resolveForRequest(
      {
        params: { requestId: 'request-1' },
        baseUrl: '/org',
        route: { path: '/move-out-requests/:requestId/approve' },
        originalUrl: '/org/move-out-requests/request-1/approve',
      } as never,
      'org-1',
    );

    expect(prisma.moveOutRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'request-1', orgId: 'org-1' },
      select: { buildingId: true },
    });
    expect(prisma.moveInRequest.findFirst).not.toHaveBeenCalled();
    expect(prisma.maintenanceRequest.findFirst).not.toHaveBeenCalled();
    expect(buildingId).toBe('building-9');
  });
});
