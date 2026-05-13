import { Injectable } from '@nestjs/common';
import { AccessControlRepo } from '../access-control/access-control.repo';
import { isVisibleRoleTemplate } from '../access-control/role-defaults';
import {
  BuildingAssignmentResponseDto,
  toBuildingAssignmentResponse,
} from './dto/building-assignment.response.dto';

@Injectable()
export class BuildingAssignmentsService {
  constructor(private readonly accessControlRepo: AccessControlRepo) {}

  async listAssignments(
    orgId: string,
    buildingId: string,
  ): Promise<BuildingAssignmentResponseDto[]> {
    const assignments =
      await this.accessControlRepo.listBuildingAccessAssignments(
        buildingId,
        orgId,
      );

    return assignments
      .filter((assignment) => isVisibleRoleTemplate(assignment.roleTemplate))
      .map(toBuildingAssignmentResponse);
  }
}
