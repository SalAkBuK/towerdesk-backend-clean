import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderPortalView } from '../service-providers.repo';

export class ProviderProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  serviceCategory?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export const toProviderProfileResponse = (
  provider: ProviderPortalView,
): ProviderProfileResponseDto => ({
  id: provider.id,
  name: provider.name,
  serviceCategory: provider.serviceCategory ?? null,
  contactName: provider.contactName ?? null,
  contactEmail: provider.contactEmail ?? null,
  contactPhone: provider.contactPhone ?? null,
  notes: provider.notes ?? null,
  isActive: provider.isActive,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
});
