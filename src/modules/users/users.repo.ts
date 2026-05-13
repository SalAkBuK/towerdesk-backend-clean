import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersRepo {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  listByOrg(orgId: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateProfile(
    id: string,
    data: { name?: string; avatarUrl?: string; phone?: string },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
    });
  }
}
