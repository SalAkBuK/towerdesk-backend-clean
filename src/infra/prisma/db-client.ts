import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type DbClient = PrismaService | Prisma.TransactionClient;
