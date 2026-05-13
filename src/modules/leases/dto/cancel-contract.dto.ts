import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
