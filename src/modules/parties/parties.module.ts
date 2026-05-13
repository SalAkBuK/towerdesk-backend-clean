import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { PartyIdentifierService } from './party-identifier.service';
import { PartyResolutionService } from './party-resolution.service';
import { PartyResolutionTokenService } from './party-resolution-token.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  providers: [
    PartyIdentifierService,
    PartyResolutionService,
    PartyResolutionTokenService,
  ],
  exports: [
    PartyIdentifierService,
    PartyResolutionService,
    PartyResolutionTokenService,
  ],
})
export class PartiesModule {}
