import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LeaseActivityAction, LeaseDocument } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { StorageService } from '../../infra/storage/storage.service';
import { LeasesRepo } from './leases.repo';
import { LeaseDocumentsRepo } from './lease-documents.repo';
import { CreateLeaseDocumentDto } from './dto/create-lease-document.dto';
import { LeaseActivityRepo } from './lease-activity.repo';

@Injectable()
export class LeaseDocumentsService {
  constructor(
    private readonly leasesRepo: LeasesRepo,
    private readonly leaseDocumentsRepo: LeaseDocumentsRepo,
    private readonly leaseActivityRepo: LeaseActivityRepo,
    private readonly storageService: StorageService,
  ) {}

  async listDocuments(user: AuthenticatedUser | undefined, leaseId: string) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);
    const documents = await this.leaseDocumentsRepo.listByLeaseId(
      orgId,
      leaseId,
    );
    return this.attachResolvedUrls(documents);
  }

  async listActiveResidentDocuments(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const lease = await this.leasesRepo.findActiveLeaseByResident(
      orgId,
      userId,
    );
    if (!lease) {
      return [];
    }

    const documents = await this.leaseDocumentsRepo.listByLeaseId(
      orgId,
      lease.id,
    );
    return this.attachResolvedUrls(documents);
  }

  async createDocument(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    dto: CreateLeaseDocumentDto,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);
    const document = await this.leaseDocumentsRepo.create(orgId, leaseId, {
      type: dto.type,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      url: dto.url,
    });
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.DOCUMENT_ADDED,
      changedByUserId: user?.sub ?? null,
      payload: {
        documentId: document.id,
        type: document.type,
        fileName: document.fileName,
        sizeBytes: document.sizeBytes,
      },
    });
    return this.resolveDocumentUrl(document);
  }

  async deleteDocument(
    user: AuthenticatedUser | undefined,
    leaseId: string,
    documentId: string,
  ) {
    const orgId = assertOrgScope(user);
    await this.findLeaseOrThrow(orgId, leaseId);
    const document = await this.leaseDocumentsRepo.findById(
      orgId,
      leaseId,
      documentId,
    );
    if (!document) {
      throw new NotFoundException('Lease document not found');
    }
    await this.leaseDocumentsRepo.deleteById(document.id);
    await this.leaseActivityRepo.create({
      orgId,
      leaseId,
      action: LeaseActivityAction.DOCUMENT_DELETED,
      changedByUserId: user?.sub ?? null,
      payload: {
        documentId: document.id,
        type: document.type,
        fileName: document.fileName,
      },
    });
  }

  private async findLeaseOrThrow(orgId: string, leaseId: string) {
    const lease = await this.leasesRepo.findById(orgId, leaseId);
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  private async attachResolvedUrls(documents: LeaseDocument[]) {
    return Promise.all(
      documents.map((document) => this.resolveDocumentUrl(document)),
    );
  }

  private async resolveDocumentUrl<T extends { url: string }>(
    document: T,
  ): Promise<T> {
    if (!document.url.startsWith('storage://')) {
      return document;
    }
    const key = document.url.slice('storage://'.length);
    if (!key) {
      return document;
    }

    const signedUrl = await this.storageService.getSignedUrl({ key });
    return { ...document, url: signedUrl };
  }
}
