import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ProviderAccessGrantsController } from './provider-access-grants.controller';
import { ProviderAccessGrantService } from './provider-access-grant.service';
import { ProviderAccessService } from './provider-access.service';
import { ProviderPortalController } from './provider-portal.controller';
import { ProviderPortalService } from './provider-portal.service';
import { ServiceProvidersController } from './service-providers.controller';
import { ServiceProvidersRepo } from './service-providers.repo';
import { ServiceProvidersService } from './service-providers.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    ServiceProvidersController,
    ProviderAccessGrantsController,
    ProviderPortalController,
  ],
  providers: [
    ServiceProvidersRepo,
    ServiceProvidersService,
    ProviderAccessGrantService,
    ProviderAccessService,
    ProviderPortalService,
  ],
  exports: [ProviderAccessService],
})
export class ServiceProvidersModule {}
