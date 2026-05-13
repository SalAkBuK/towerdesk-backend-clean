import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyType } from '@prisma/client';

class ResolvedPartySummaryDto {
  @ApiProperty({ enum: PartyType })
  partyType!: PartyType;

  @ApiProperty()
  displayNameEn!: string;

  @ApiPropertyOptional({ nullable: true })
  displayNameAr?: string | null;

  @ApiProperty()
  maskedIdentifier!: string;
}

export class ResolvePartyResponseDto {
  @ApiProperty()
  matchFound!: boolean;

  @ApiPropertyOptional({ type: ResolvedPartySummaryDto, nullable: true })
  party?: ResolvedPartySummaryDto | null;

  @ApiPropertyOptional({ nullable: true })
  resolutionToken?: string | null;
}
