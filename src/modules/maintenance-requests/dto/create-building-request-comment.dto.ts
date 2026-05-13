import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateRequestCommentDto } from './create-request-comment.dto';
import { MaintenanceRequestCommentVisibilityEnum } from '../maintenance-requests.constants';

export class CreateBuildingRequestCommentDto extends CreateRequestCommentDto {
  @ApiPropertyOptional({
    enum: MaintenanceRequestCommentVisibilityEnum,
    default: MaintenanceRequestCommentVisibilityEnum.SHARED,
  })
  @IsOptional()
  @IsEnum(MaintenanceRequestCommentVisibilityEnum)
  visibility?: MaintenanceRequestCommentVisibilityEnum;
}
