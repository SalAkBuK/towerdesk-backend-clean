import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Processor, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: Redis | null) {}

  isEnabled() {
    return Boolean(this.connection);
  }

  async enqueue(
    queueName: string,
    jobName: string,
    data: Record<string, unknown>,
    options?: JobsOptions,
  ) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return false;
    }

    await queue.add(jobName, data, options);
    return true;
  }

  createWorker(
    queueName: string,
    processor: Processor,
    options?: { concurrency?: number },
  ) {
    if (!this.connection) {
      return null;
    }

    const workerConnection = this.connection.duplicate({
      maxRetriesPerRequest: null,
    });

    return new Worker(queueName, processor, {
      connection: workerConnection,
      concurrency: options?.concurrency ?? 1,
    });
  }

  async closeWorker(worker: Worker | null | undefined) {
    if (!worker) {
      return;
    }
    await worker.close();
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
  }

  private getQueue(queueName: string) {
    if (!this.connection) {
      return null;
    }

    const existing = this.queues.get(queueName);
    if (existing) {
      return existing;
    }

    const queue = new Queue(queueName, {
      connection: this.connection,
    });
    this.queues.set(queueName, queue);
    return queue;
  }
}
