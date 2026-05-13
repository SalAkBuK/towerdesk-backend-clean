import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MaintenanceRequestStatusEnum } from '../maintenance-requests.constants';

export class ListProviderRequestsQueryDto {
  @ApiPropertyOptional({ enum: MaintenanceRequestStatusEnum })
  @IsOptional()
  @IsEnum(MaintenanceRequestStatusEnum)
  status?: MaintenanceRequestStatusEnum;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  serviceProviderId?: string;
}
