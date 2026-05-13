import { Module } from '@nestjs/common';
import { RequestMetricsService } from './request-metrics.service';

@Module({
  providers: [RequestMetricsService],
  exports: [RequestMetricsService],
})
export class MetricsModule {}
