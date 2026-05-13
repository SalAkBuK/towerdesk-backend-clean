import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrgProfileController } from './org-profile.controller';
import { OrgProfileService } from './org-profile.service';

@Module({
  imports: [PrismaModule, AccessControlModule],
  controllers: [OrgProfileController],
  providers: [OrgProfileService],
})
export class OrgProfileModule {}
