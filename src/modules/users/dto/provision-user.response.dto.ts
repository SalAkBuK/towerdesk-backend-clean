import { ApiProperty } from '@nestjs/swagger';
import {
  UserAccessAssignmentDto,
  UserResidentDto,
  UserResponseDto,
} from './user.response.dto';

export class ProvisionedAppliedDto {
  @ApiProperty({ type: [UserAccessAssignmentDto] })
  orgAccess!: UserAccessAssignmentDto[];

  @ApiProperty({ type: [UserAccessAssignmentDto] })
  buildingAccess!: UserAccessAssignmentDto[];

  @ApiProperty({
    required: false,
    nullable: true,
    type: UserResidentDto,
  })
  resident!: UserResidentDto | null;
}

export class ProvisionUserResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty()
  created!: boolean;

  @ApiProperty()
  linkedExisting!: boolean;

  @ApiProperty({ type: ProvisionedAppliedDto })
  applied!: ProvisionedAppliedDto;
}

export const toProvisionedUserDto = (user: UserResponseDto): UserResponseDto =>
  user;
