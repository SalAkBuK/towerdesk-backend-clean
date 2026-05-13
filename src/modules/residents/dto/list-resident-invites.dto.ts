import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const residentInviteStatusValues = [
  'ALL',
  'PENDING',
  'ACCEPTED',
  'FAILED',
  'EXPIRED',
] as const;

export type ResidentInviteStatusFilter =
  (typeof residentInviteStatusValues)[number];

export class ListResidentInvitesQueryDto {
  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100)', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search by resident name or email' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: residentInviteStatusValues, default: 'ALL' })
  @IsOptional()
  @IsIn(residentInviteStatusValues)
  status?: ResidentInviteStatusFilter;
}

export class ResidentInviteUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;
}

export class ResidentInviteActorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;
}

export class ResidentInviteRowDto {
  @ApiProperty()
  inviteId!: string;

  @ApiProperty({
    enum: ['PENDING', 'ACCEPTED', 'FAILED', 'EXPIRED'],
  })
  status!: 'PENDING' | 'ACCEPTED' | 'FAILED' | 'EXPIRED';

  @ApiProperty()
  sentAt!: Date;

  @ApiProperty()
  expiresAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  failedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  failureReason?: string | null;

  @ApiProperty({ type: ResidentInviteUserDto })
  user!: ResidentInviteUserDto;

  @ApiPropertyOptional({ type: ResidentInviteActorDto, nullable: true })
  createdByUser?: ResidentInviteActorDto | null;
}

export class ResidentInviteListResponseDto {
  @ApiProperty({ type: [ResidentInviteRowDto] })
  items!: ResidentInviteRowDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string;
}
