import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UpdateOrgProfileDto } from './dto/update-org-profile.dto';

@Injectable()
export class OrgProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(orgId: string) {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Org not found');
    }
    return org;
  }

  async updateProfile(orgId: string, data: UpdateOrgProfileDto) {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Org not found');
    }
    return this.prisma.org.update({
      where: { id: orgId },
      data: {
        name: data.name,
        logoUrl: data.logoUrl,
        businessName: data.businessName,
        businessType: data.businessType,
        tradeLicenseNumber: data.tradeLicenseNumber,
        vatRegistrationNumber: data.vatRegistrationNumber,
        registeredOfficeAddress: data.registeredOfficeAddress,
        city: data.city,
        officePhoneNumber: data.officePhoneNumber,
        businessEmailAddress: data.businessEmailAddress,
        website: data.website,
        ownerName: data.ownerName,
      },
    });
  }
}
