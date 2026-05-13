import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppLoggerModule } from './infra/logger/logger.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BroadcastsModule } from './modules/broadcasts/broadcasts.module';

@Module({
  imports: [
    AppLoggerModule,
    PrismaModule,
    QueueModule,
    EventEmitterModule.forRoot(),
    AuthModule,
    NotificationsModule,
    BroadcastsModule,
  ],
})
export class WorkerModule {}
