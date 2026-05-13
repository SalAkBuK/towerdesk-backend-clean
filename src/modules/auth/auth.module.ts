import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRepo } from './auth.repo';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthValidationService } from './auth-validation.service';
import { EmailModule } from '../../infra/email/email.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { AuthPasswordDeliveryService } from './auth-password-delivery.service';
import { AuthDeliveryWorker } from './auth-delivery.worker';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    PrismaModule,
    EmailModule,
    AccessControlModule,
    QueueModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepo,
    AuthPasswordDeliveryService,
    AuthDeliveryWorker,
    JwtStrategy,
    RefreshTokenGuard,
    AuthValidationService,
  ],
  exports: [AuthService, AuthValidationService, AuthPasswordDeliveryService],
})
export class AuthModule {}
