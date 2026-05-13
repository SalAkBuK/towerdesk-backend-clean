import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ConversationCounterpartyGroup,
  ConversationType,
} from '@prisma/client';
import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ListConversationsQueryDto {
  @ApiPropertyOptional({ enum: ConversationType })
  @IsOptional()
  @IsEnum(ConversationType)
  type?: ConversationType;

  @ApiPropertyOptional({ enum: ConversationCounterpartyGroup })
  @IsOptional()
  @IsEnum(ConversationCounterpartyGroup)
  counterpartyGroup?: ConversationCounterpartyGroup;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
