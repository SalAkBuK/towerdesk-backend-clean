import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'User IDs of participants to add to the conversation',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  participantUserIds!: string[];

  @ApiPropertyOptional({
    description: 'Conversation subject',
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

  @ApiPropertyOptional({
    description: 'Optional building ID to scope the conversation',
  })
  @IsOptional()
  @IsUUID('4')
  buildingId?: string;
}
