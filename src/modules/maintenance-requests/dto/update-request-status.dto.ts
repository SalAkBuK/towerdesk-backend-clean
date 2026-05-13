import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MaintenanceRequestStatusEnum } from '../maintenance-requests.constants';

export class UpdateRequestStatusDto {
  @ApiProperty({
    enum: [
      MaintenanceRequestStatusEnum.IN_PROGRESS,
      MaintenanceRequestStatusEnum.COMPLETED,
    ],
  })
  @IsEnum(MaintenanceRequestStatusEnum)
  status!: MaintenanceRequestStatusEnum;
}
