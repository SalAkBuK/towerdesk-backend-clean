import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { S3Adapter } from './s3.adapter';

@Module({
  providers: [StorageService, S3Adapter],
  exports: [StorageService],
})
export class StorageModule {}
