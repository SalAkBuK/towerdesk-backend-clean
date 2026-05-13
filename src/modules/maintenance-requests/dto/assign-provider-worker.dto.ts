import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignProviderWorkerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}
