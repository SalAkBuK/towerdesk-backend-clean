import { Injectable } from '@nestjs/common';
import { LeaseDocument, LeaseDocumentType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';

type LeaseDocumentCreateData = {
  type: LeaseDocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

@Injectable()
export class LeaseDocumentsRepo {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: DbClient) {
    return tx ?? this.prisma;
  }

  listByLeaseId(orgId: string, leaseId: string): Promise<LeaseDocument[]> {
    return this.prisma.leaseDocument.findMany({
      where: { orgId, leaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    orgId: string,
    leaseId: string,
    data: LeaseDocumentCreateData,
    tx?: DbClient,
  ): Promise<LeaseDocument> {
    const prisma = this.client(tx);
    return prisma.leaseDocument.create({
      data: {
        orgId,
        leaseId,
        type: data.type,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        url: data.url,
      },
    });
  }

  findById(
    orgId: string,
    leaseId: string,
    documentId: string,
    tx?: DbClient,
  ): Promise<LeaseDocument | null> {
    const prisma = this.client(tx);
    return prisma.leaseDocument.findFirst({
      where: { id: documentId, orgId, leaseId },
    });
  }

  deleteById(documentId: string, tx?: DbClient): Promise<LeaseDocument> {
    const prisma = this.client(tx);
    return prisma.leaseDocument.delete({
      where: { id: documentId },
    });
  }
}
