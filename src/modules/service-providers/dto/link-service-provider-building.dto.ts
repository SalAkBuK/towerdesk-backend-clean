import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkServiceProviderBuildingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buildingId!: string;
}
