import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { env } from '../../config/env';

@Injectable()
export class QueueRuntimeGuardService implements OnModuleInit {
  private readonly logger = new Logger(QueueRuntimeGuardService.name);

  onModuleInit() {
    if (env.APP_RUNTIME === 'worker' && !env.QUEUE_ENABLED) {
      throw new Error(
        'Worker runtime requires QUEUE_ENABLED=true. Refusing to start without Redis-backed queues.',
      );
    }

    if (env.NODE_ENV === 'production' && !env.QUEUE_ENABLED) {
      throw new Error(
        'Production runtime requires QUEUE_ENABLED=true. Refusing to fall back to inline delivery.',
      );
    }

    this.logger.log(
      `Queue runtime guard passed (runtime=${env.APP_RUNTIME}, queueEnabled=${env.QUEUE_ENABLED})`,
    );
  }
}
