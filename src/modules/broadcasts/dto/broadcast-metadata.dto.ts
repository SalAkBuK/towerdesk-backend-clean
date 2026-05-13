import { ApiProperty } from '@nestjs/swagger';
import { BroadcastAudience } from '../broadcasts.constants';

export const broadcastMetadataScopeValues = [
  'single_building',
  'multi_building',
  'org_wide',
] as const;

export type BroadcastMetadataScope =
  (typeof broadcastMetadataScopeValues)[number];

export type BroadcastMetadata = {
  audiences: BroadcastAudience[];
  scope: BroadcastMetadataScope;
  buildingCount: number;
  audienceSummary: string;
};

export class BroadcastMetadataDto {
  @ApiProperty({ enum: BroadcastAudience, isArray: true })
  audiences!: BroadcastAudience[];

  @ApiProperty({ enum: broadcastMetadataScopeValues })
  scope!: BroadcastMetadataScope;

  @ApiProperty()
  buildingCount!: number;

  @ApiProperty()
  audienceSummary!: string;
}

const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  [BroadcastAudience.TENANTS]: 'Tenants',
  [BroadcastAudience.ADMINS]: 'Admins',
  [BroadcastAudience.STAFF]: 'Staff',
  [BroadcastAudience.MANAGERS]: 'Managers',
  [BroadcastAudience.BUILDING_ADMINS]: 'Building Admins',
  [BroadcastAudience.ALL_USERS]: 'All Users',
};

export const buildBroadcastAudienceSummary = (
  audiences: BroadcastAudience[],
): string => {
  if (audiences.length === 0) {
    return 'Recipients';
  }

  const labels = audiences.map((audience) => AUDIENCE_LABELS[audience]);
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
};

export const inferBroadcastMetadataScope = (input: {
  buildingCount: number;
  isOrgWide: boolean;
}): BroadcastMetadataScope => {
  if (input.isOrgWide) {
    return 'org_wide';
  }
  if (input.buildingCount <= 1) {
    return 'single_building';
  }
  return 'multi_building';
};

export const buildBroadcastMetadata = (input: {
  audiences: BroadcastAudience[];
  buildingCount: number;
  isOrgWide: boolean;
}): BroadcastMetadata => ({
  audiences: input.audiences,
  scope: inferBroadcastMetadataScope(input),
  buildingCount: input.buildingCount,
  audienceSummary: buildBroadcastAudienceSummary(input.audiences),
});
