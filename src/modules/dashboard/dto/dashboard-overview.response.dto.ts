import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryDto {
  @ApiProperty()
  buildingsTotal!: number;

  @ApiProperty()
  unitsTotal!: number;

  @ApiProperty()
  occupiedUnits!: number;

  @ApiProperty()
  vacantUnits!: number;

  @ApiProperty()
  occupancyRate!: number;

  @ApiProperty()
  activeLeases!: number;

  @ApiProperty()
  openMaintenanceRequests!: number;

  @ApiProperty()
  overdueMaintenanceRequests!: number;

  @ApiProperty()
  visitorsToday!: number;

  @ApiProperty()
  activeParkingAllocations!: number;

  @ApiProperty()
  broadcastsLast30Days!: number;

  @ApiProperty()
  unreadNotifications!: number;
}

export class DashboardMaintenanceTrendPointDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  completed!: number;
}

export class DashboardVisitorTrendPointDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  created!: number;
}

export class DashboardBroadcastTrendPointDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  sent!: number;

  @ApiProperty()
  recipientCount!: number;
}

export class DashboardTrendsDto {
  @ApiProperty({ type: [DashboardMaintenanceTrendPointDto] })
  maintenance!: DashboardMaintenanceTrendPointDto[];

  @ApiProperty({ type: [DashboardVisitorTrendPointDto] })
  visitors!: DashboardVisitorTrendPointDto[];

  @ApiProperty({ type: [DashboardBroadcastTrendPointDto] })
  broadcasts!: DashboardBroadcastTrendPointDto[];
}

export class DashboardBuildingMetricDto {
  @ApiProperty()
  buildingId!: string;

  @ApiProperty()
  buildingName!: string;

  @ApiProperty()
  totalUnits!: number;

  @ApiProperty()
  occupiedUnits!: number;

  @ApiProperty()
  vacantUnits!: number;

  @ApiProperty()
  occupancyRate!: number;

  @ApiProperty()
  activeLeases!: number;

  @ApiProperty()
  openMaintenanceRequests!: number;

  @ApiProperty()
  activeParkingAllocations!: number;

  @ApiProperty()
  parkingSlotsTotal!: number;
}

export class DashboardOverviewResponseDto {
  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto;

  @ApiProperty({ type: DashboardTrendsDto })
  trends!: DashboardTrendsDto;

  @ApiProperty({ type: [DashboardBuildingMetricDto] })
  buildings!: DashboardBuildingMetricDto[];
}
