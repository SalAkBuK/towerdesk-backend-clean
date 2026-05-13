import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaseResponseDto } from './lease.dto';

export class OrgLeasesResponseDto {
  @ApiProperty({ type: [LeaseResponseDto] })
  items!: LeaseResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string;
}
