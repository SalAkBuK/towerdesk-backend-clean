import { Injectable } from '@nestjs/common';
import { S3Adapter } from './s3.adapter';

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}

export interface GetSignedUrlInput {
  key: string;
  expiresInSeconds?: number;
}

export interface GetUploadSignedUrlInput {
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
}

export interface DeleteObjectInput {
  key: string;
}

export interface GetPublicUrlInput {
  key: string;
}

export interface StorageClient {
  putObject(input: PutObjectInput): Promise<void>;
  getSignedUrl(input: GetSignedUrlInput): Promise<string>;
  getUploadSignedUrl(input: GetUploadSignedUrlInput): Promise<string>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
}

@Injectable()
export class StorageService implements StorageClient {
  constructor(private readonly adapter: S3Adapter) {}

  putObject(input: PutObjectInput): Promise<void> {
    return this.adapter.putObject(input);
  }

  getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    return this.adapter.getSignedUrl(input);
  }

  getUploadSignedUrl(input: GetUploadSignedUrlInput): Promise<string> {
    return this.adapter.getUploadSignedUrl(input);
  }

  getPublicUrl(input: GetPublicUrlInput): string {
    return this.adapter.getPublicUrl(input);
  }

  deleteObject(input: DeleteObjectInput): Promise<void> {
    return this.adapter.deleteObject(input);
  }
}
