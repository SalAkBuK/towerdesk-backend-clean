import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { OwnerPortfolioGuard } from '../../common/guards/owner-portfolio.guard';
import { OwnerProfileController } from './owner-profile.controller';
import { OwnerProfileService } from './owner-profile.service';
import { OwnerPortfolioController } from './owner-portfolio.controller';
import { OwnerPortfolioScopeService } from './owner-portfolio-scope.service';

@Module({
  imports: [PrismaModule],
  controllers: [OwnerPortfolioController, OwnerProfileController],
  providers: [
    OwnerPortfolioScopeService,
    OwnerPortfolioGuard,
    OwnerProfileService,
  ],
  exports: [OwnerPortfolioScopeService],
})
export class OwnerPortfolioModule {}
