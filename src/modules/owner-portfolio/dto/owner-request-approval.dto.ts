import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApproveOwnerRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approvalReason?: string;
}

export class RejectOwnerRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  approvalReason!: string;
}
