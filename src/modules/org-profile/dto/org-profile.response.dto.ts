import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgBusinessType } from '@prisma/client';

export class OrgProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  logoUrl?: string | null;

  @ApiPropertyOptional()
  businessName?: string | null;

  @ApiPropertyOptional({ enum: OrgBusinessType })
  businessType?: OrgBusinessType | null;

  @ApiPropertyOptional()
  tradeLicenseNumber?: string | null;

  @ApiPropertyOptional()
  vatRegistrationNumber?: string | null;

  @ApiPropertyOptional()
  registeredOfficeAddress?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  officePhoneNumber?: string | null;

  @ApiPropertyOptional()
  businessEmailAddress?: string | null;

  @ApiPropertyOptional()
  website?: string | null;

  @ApiPropertyOptional()
  ownerName?: string | null;
}

export const toOrgProfileResponse = (org: {
  id: string;
  name: string;
  logoUrl?: string | null;
  businessName?: string | null;
  businessType?: OrgBusinessType | null;
  tradeLicenseNumber?: string | null;
  vatRegistrationNumber?: string | null;
  registeredOfficeAddress?: string | null;
  city?: string | null;
  officePhoneNumber?: string | null;
  businessEmailAddress?: string | null;
  website?: string | null;
  ownerName?: string | null;
}): OrgProfileResponseDto => ({
  id: org.id,
  name: org.name,
  logoUrl: org.logoUrl ?? null,
  businessName: org.businessName ?? null,
  businessType: org.businessType ?? null,
  tradeLicenseNumber: org.tradeLicenseNumber ?? null,
  vatRegistrationNumber: org.vatRegistrationNumber ?? null,
  registeredOfficeAddress: org.registeredOfficeAddress ?? null,
  city: org.city ?? null,
  officePhoneNumber: org.officePhoneNumber ?? null,
  businessEmailAddress: org.businessEmailAddress ?? null,
  website: org.website ?? null,
  ownerName: org.ownerName ?? null,
});
