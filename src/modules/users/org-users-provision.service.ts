import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { ProvisionUserDto } from './dto/provision-user.dto';
import {
  ProvisionUserResponseDto,
  toProvisionedUserDto,
} from './dto/provision-user.response.dto';
import { OrgUserLifecycleService } from './org-user-lifecycle.service';

@Injectable()
export class OrgUsersProvisionService {
  constructor(
    private readonly orgUserLifecycleService: OrgUserLifecycleService,
  ) {}

  async provision(
    user: AuthenticatedUser | undefined,
    dto: ProvisionUserDto,
  ): Promise<ProvisionUserResponseDto> {
    const orgId = assertOrgScope(user);

    const result = await this.orgUserLifecycleService.provisionOrgUser({
      actor: user,
      orgId,
      identity: {
        email: dto.identity.email,
        name: dto.identity.name,
        password: dto.identity.password,
        sendInvite: dto.identity.sendInvite,
      },
      accessAssignments: dto.accessAssignments ?? [],
      resident: dto.resident,
      mode: dto.mode,
    });

    return {
      user: toProvisionedUserDto(result.user),
      created: result.created,
      linkedExisting: result.linkedExisting,
      applied: result.applied,
    };
  }
}
