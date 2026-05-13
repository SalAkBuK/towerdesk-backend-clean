import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateResidentManagementConversationDto {
  @ApiPropertyOptional({
    description:
      'Optional management user to target for a private resident-to-management conversation',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  managementUserId?: string;

  @ApiPropertyOptional({
    description: 'Optional conversation subject',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiProperty({
    description: 'Initial message content',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}
