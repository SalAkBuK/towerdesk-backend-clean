import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  MaintenanceRequestOwnerApprovalStatusEnum,
  MaintenanceRequestQueueEnum,
  MaintenanceRequestStatusEnum,
} from '../maintenance-requests.constants';

export class ListBuildingRequestsQueryDto {
  @ApiPropertyOptional({ enum: MaintenanceRequestStatusEnum })
  @IsOptional()
  @IsEnum(MaintenanceRequestStatusEnum)
  status?: MaintenanceRequestStatusEnum;

  @ApiPropertyOptional({ enum: MaintenanceRequestOwnerApprovalStatusEnum })
  @IsOptional()
  @IsEnum(MaintenanceRequestOwnerApprovalStatusEnum)
  ownerApprovalStatus?: MaintenanceRequestOwnerApprovalStatusEnum;

  @ApiPropertyOptional({ enum: MaintenanceRequestQueueEnum })
  @IsOptional()
  @IsEnum(MaintenanceRequestQueueEnum)
  queue?: MaintenanceRequestQueueEnum;
}
