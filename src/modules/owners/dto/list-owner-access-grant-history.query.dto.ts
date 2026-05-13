import { ApiPropertyOptional } from '@nestjs/swagger';
import { OwnerAccessGrantAuditAction } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListOwnerAccessGrantHistoryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  grantId?: string;

  @ApiPropertyOptional({ enum: OwnerAccessGrantAuditAction })
  @IsOptional()
  @IsEnum(OwnerAccessGrantAuditAction)
  action?: OwnerAccessGrantAuditAction;
}
