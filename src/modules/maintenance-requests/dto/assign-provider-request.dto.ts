import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignProviderRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceProviderId!: string;
}
