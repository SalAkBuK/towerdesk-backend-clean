import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  staffUserId!: string;
}
