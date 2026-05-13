import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  userResidentInviteStatusValues,
  UserResidentInviteStatus,
  userResidentOccupancyStatusValues,
  UserResidentOccupancyStatus,
} from '../../users/dto/user.response.dto';

export class CurrentUnitOccupantResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;
}

export class RequesterContextResponseDto {
  @ApiProperty()
  isResident!: boolean;

  @ApiPropertyOptional({
    enum: userResidentOccupancyStatusValues,
    nullable: true,
  })
  residentOccupancyStatus!: UserResidentOccupancyStatus | null;

  @ApiPropertyOptional({
    enum: userResidentInviteStatusValues,
    nullable: true,
  })
  residentInviteStatus!: UserResidentInviteStatus | null;

  @ApiProperty()
  isFormerResident!: boolean;

  @ApiPropertyOptional({ nullable: true })
  currentUnitOccupiedByRequester!: boolean | null;

  @ApiPropertyOptional({
    type: CurrentUnitOccupantResponseDto,
    nullable: true,
  })
  currentUnitOccupant!: CurrentUnitOccupantResponseDto | null;
}

export type RequesterContextResponse = {
  isResident: boolean;
  residentOccupancyStatus: UserResidentOccupancyStatus | null;
  residentInviteStatus: UserResidentInviteStatus | null;
  isFormerResident: boolean;
  currentUnitOccupiedByRequester: boolean | null;
  currentUnitOccupant: {
    userId: string;
    name?: string | null;
  } | null;
};
