import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { env } from '../../config/env';

@Injectable()
export class RequestMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly samples = new Map<string, number[]>();
  private readonly enabled = env.REQUEST_METRICS_ENABLED ?? false;
  private readonly maxSamples = env.REQUEST_METRICS_SAMPLE_SIZE ?? 300;
  private readonly intervalMs = env.REQUEST_METRICS_INTERVAL_MS ?? 60000;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly logger: Logger) {}

  onModuleInit() {
    if (!this.enabled) {
      return;
    }
    this.timer = setInterval(() => this.flush(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  record(routeKey: string, durationMs: number) {
    if (!this.enabled) {
      return;
    }
    const bucket = this.samples.get(routeKey) ?? [];
    bucket.push(durationMs);
    if (bucket.length > this.maxSamples) {
      bucket.shift();
    }
    this.samples.set(routeKey, bucket);
  }

  private flush() {
    for (const [routeKey, values] of this.samples.entries()) {
      if (values.length === 0) {
        continue;
      }
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = percentile(sorted, 0.5);
      const p95 = percentile(sorted, 0.95);
      const p99 = percentile(sorted, 0.99);

      this.logger.log(
        {
          route: routeKey,
          count: values.length,
          p50,
          p95,
          p99,
        },
        'request metrics',
      );
    }

    this.samples.clear();
  }
}

const percentile = (sorted: number[], quantile: number) => {
  if (sorted.length === 0) {
    return 0;
  }
  const position = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return Math.round(sorted[position]);
};
