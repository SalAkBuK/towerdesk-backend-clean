import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResidentProfile } from '@prisma/client';

export class ResidentProfileUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl?: string | null;
}

export class ResidentProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: ResidentProfileUserDto })
  user!: ResidentProfileUserDto;

  @ApiPropertyOptional()
  emiratesIdNumber?: string | null;

  @ApiPropertyOptional()
  passportNumber?: string | null;

  @ApiPropertyOptional()
  nationality?: string | null;

  @ApiPropertyOptional()
  dateOfBirth?: Date | null;

  @ApiPropertyOptional()
  currentAddress?: string | null;

  @ApiPropertyOptional()
  emergencyContactName?: string | null;

  @ApiPropertyOptional()
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  preferredBuildingId?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toResidentProfileResponse = (
  profile: ResidentProfile & { user: ResidentProfileUserDto },
): ResidentProfileResponseDto => ({
  id: profile.id,
  orgId: profile.orgId,
  userId: profile.userId,
  user: {
    id: profile.user.id,
    email: profile.user.email,
    name: profile.user.name ?? null,
    phone: profile.user.phone ?? null,
    avatarUrl: profile.user.avatarUrl ?? null,
  },
  emiratesIdNumber: profile.emiratesIdNumber ?? null,
  passportNumber: profile.passportNumber ?? null,
  nationality: profile.nationality ?? null,
  dateOfBirth: profile.dateOfBirth ?? null,
  currentAddress: profile.currentAddress ?? null,
  emergencyContactName: profile.emergencyContactName ?? null,
  emergencyContactPhone: profile.emergencyContactPhone ?? null,
  preferredBuildingId: profile.preferredBuildingId ?? null,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});
