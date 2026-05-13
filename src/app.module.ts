import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { HealthModule } from './modules/health/health.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { PlatformModule } from './modules/platform/platform.module';
import { UnitsModule } from './modules/units/units.module';
import { UnitTypesModule } from './modules/unit-types/unit-types.module';
import { OwnersModule } from './modules/owners/owners.module';
import { BuildingAmenitiesModule } from './modules/building-amenities/building-amenities.module';
import { OccupanciesModule } from './modules/occupancies/occupancies.module';
import { ResidentsModule } from './modules/residents/residents.module';
import { MaintenanceRequestsModule } from './modules/maintenance-requests/maintenance-requests.module';
import { OrgProfileModule } from './modules/org-profile/org-profile.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BroadcastsModule } from './modules/broadcasts/broadcasts.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ParkingModule } from './modules/parking/parking.module';
import { VisitorsModule } from './modules/visitors/visitors.module';
import { LeasesModule } from './modules/leases/leases.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BuildingAssignmentsModule } from './modules/building-assignments/building-assignments.module';
import { OwnerPortfolioModule } from './modules/owner-portfolio/owner-portfolio.module';
import { ServiceProvidersModule } from './modules/service-providers/service-providers.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { env } from './config/env';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AppLoggerModule } from './infra/logger/logger.module';
import { StorageModule } from './infra/storage/storage.module';
import { QueueModule } from './infra/queue/queue.module';
import { MetricsModule } from './infra/metrics/metrics.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    AppLoggerModule,
    PrismaModule,
    StorageModule,
    QueueModule,
    MetricsModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: (env.THROTTLE_TTL ?? 60) * 1000,
        limit: env.THROTTLE_LIMIT ?? 300,
      },
    ]),
    AuthModule,
    UsersModule,
    AccessControlModule,
    HealthModule,
    BuildingsModule,
    PlatformModule,
    UnitsModule,
    UnitTypesModule,
    OwnersModule,
    BuildingAmenitiesModule,
    OccupanciesModule,
    ResidentsModule,
    MaintenanceRequestsModule,
    OrgProfileModule,
    NotificationsModule,
    BroadcastsModule,
    MessagingModule,
    ServiceProvidersModule,
    ParkingModule,
    VisitorsModule,
    LeasesModule,
    DashboardModule,
    BuildingAssignmentsModule,
    OwnerPortfolioModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
