import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  BroadcastMetadata,
  BroadcastMetadataDto,
  inferBroadcastMetadataScope,
} from './broadcast-metadata.dto';

export class BroadcastSenderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  email?: string;
}

export class BroadcastResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  body?: string | null;

  @ApiProperty({ type: [String] })
  buildingIds!: string[];

  @ApiProperty({ description: 'Number of recipients notified' })
  recipientCount!: number;

  @ApiProperty()
  sender!: BroadcastSenderDto;

  @ApiProperty({ type: BroadcastMetadataDto })
  metadata!: BroadcastMetadataDto;

  @ApiProperty()
  createdAt!: Date;
}

export const toBroadcastResponse = (broadcast: {
  id: string;
  title: string;
  body?: string | null;
  buildingIds: string[];
  recipientCount: number;
  metadata?: Prisma.JsonValue;
  createdAt: Date;
  senderUser: { id: string; name?: string | null; email: string };
}): BroadcastResponseDto => ({
  id: broadcast.id,
  title: broadcast.title,
  body: broadcast.body ?? null,
  buildingIds: broadcast.buildingIds,
  recipientCount: broadcast.recipientCount,
  sender: {
    id: broadcast.senderUser.id,
    name: broadcast.senderUser.name ?? 'Unknown',
    email: broadcast.senderUser.email,
  },
  metadata: toBroadcastMetadataResponse(
    broadcast.metadata,
    broadcast.buildingIds.length,
  ),
  createdAt: broadcast.createdAt,
});

const toBroadcastMetadataResponse = (
  metadata: Prisma.JsonValue | undefined,
  buildingCount: number,
): BroadcastMetadata => {
  const value =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;

  const audiences = Array.isArray(value?.audiences)
    ? value.audiences.filter(
        (audience): audience is BroadcastMetadata['audiences'][number] =>
          typeof audience === 'string',
      )
    : [];
  const scope =
    typeof value?.scope === 'string'
      ? (value.scope as BroadcastMetadata['scope'])
      : inferBroadcastMetadataScope({
          buildingCount,
          isOrgWide: false,
        });
  const resolvedBuildingCount =
    typeof value?.buildingCount === 'number'
      ? value.buildingCount
      : buildingCount;
  const audienceSummary =
    typeof value?.audienceSummary === 'string'
      ? value.audienceSummary
      : 'Recipients';

  return {
    audiences,
    scope,
    buildingCount: resolvedBuildingCount,
    audienceSummary,
  };
};
