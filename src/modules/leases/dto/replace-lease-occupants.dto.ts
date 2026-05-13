import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ReplaceLeaseOccupantsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  names!: string[];
}
