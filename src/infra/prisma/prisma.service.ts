import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    if (env.PRISMA_APPLY_SESSION_TIMEOUTS) {
      await this.$executeRawUnsafe("SET statement_timeout = '8000ms'");
      await this.$executeRawUnsafe("SET lock_timeout = '3000ms'");
      await this.$executeRawUnsafe(
        "SET idle_in_transaction_session_timeout = '30000ms'",
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
