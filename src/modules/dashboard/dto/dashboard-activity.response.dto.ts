import { ApiProperty } from '@nestjs/swagger';

export class DashboardActivityItemDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ required: false })
  description?: string | null;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty({ required: false })
  buildingId?: string | null;

  @ApiProperty({ required: false })
  buildingName?: string | null;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ required: false, type: Object })
  metadata?: Record<string, unknown>;
}

export class DashboardActivityResponseDto {
  @ApiProperty({ type: [DashboardActivityItemDto] })
  items!: DashboardActivityItemDto[];

  @ApiProperty({ required: false })
  nextCursor?: string | null;
}

export type DashboardActivityRecord = DashboardActivityItemDto;
