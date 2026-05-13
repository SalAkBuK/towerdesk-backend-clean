import { BadRequestException } from '@nestjs/common';
import { PermissionEffect } from '@prisma/client';
import { UserAccessService } from './user-access.service';

describe('UserAccessService', () => {
  it('rejects platform permission overrides for org users', async () => {
    const accessControlRepo = {
      findUserById: jest.fn().mockResolvedValue({
        id: 'user-1',
        orgId: 'org-1',
      }),
    };
    const accessControlService = {};
    const service = new UserAccessService(
      accessControlRepo as never,
      accessControlService as never,
    );

    await expect(
      service.setPermissionOverrides(
        'user-1',
        [
          {
            permissionKey: 'platform.org.create',
            effect: PermissionEffect.ALLOW,
          },
        ],
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
