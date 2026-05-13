import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UnregisterPushDeviceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  token!: string;
}
