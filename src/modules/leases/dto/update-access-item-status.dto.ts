import { ApiProperty } from '@nestjs/swagger';
import { AccessItemStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAccessItemStatusDto {
  @ApiProperty({ enum: AccessItemStatus })
  @IsEnum(AccessItemStatus)
  status!: AccessItemStatus;
}
