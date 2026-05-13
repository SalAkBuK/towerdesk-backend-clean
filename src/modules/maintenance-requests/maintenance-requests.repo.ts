import { Injectable } from '@nestjs/common';
import { MaintenanceRequestCommentReadScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DbClient } from '../../infra/prisma/db-client';
import { MaintenanceRequestStatusEnum } from './maintenance-requests.constants';

type AttachmentInput = {
  orgId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

type RequestCreateInput = Prisma.MaintenanceRequestCreateInput;
type RequestUpdateInput = Prisma.MaintenanceRequestUpdateInput;
type CommentCreateInput = Prisma.MaintenanceRequestCommentCreateInput;

const requestInclude = {
  building: true,
  unit: true,
  createdByUser: true,
  assignedToUser: true,
  serviceProvider: true,
  serviceProviderAssignedUser: true,
  attachments: true,
} satisfies Prisma.MaintenanceRequestInclude;

const providerRequestInclude = {
  building: true,
  unit: true,
  createdByUser: true,
  assignedToUser: true,
  serviceProvider: true,
  serviceProviderAssignedUser: true,
  attachments: true,
} satisfies Prisma.MaintenanceRequestInclude;

@Injectable()
export class MaintenanceRequestsRepo {
  constructor(private readonly prisma: PrismaService) {}

  createRequest(data: RequestCreateInput) {
    return this.prisma.maintenanceRequest.create({
      data,
      include: requestInclude,
    });
  }

  createRequestWithAttachments(
    data: RequestCreateInput,
    attachments: AttachmentInput[],
    tx?: DbClient,
  ) {
    if (tx) {
      return this.createRequestWithAttachmentsInTx(tx, data, attachments);
    }

    return this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) =>
        this.createRequestWithAttachmentsInTx(transaction, data, attachments),
    );
  }

  createAttachments(
    requestId: string,
    attachments: AttachmentInput[],
    tx?: DbClient,
  ) {
    if (attachments.length === 0) {
      return Promise.resolve();
    }
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequestAttachment.createMany({
      data: attachments.map((attachment) => ({
        requestId,
        ...attachment,
      })),
    });
  }

  listByCreator(orgId: string, userId: string) {
    return this.prisma.maintenanceRequest.findMany({
      where: { orgId, createdByUserId: userId },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdForCreator(
    orgId: string,
    userId: string,
    requestId: string,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequest.findFirst({
      where: { id: requestId, orgId, createdByUserId: userId },
      include: requestInclude,
    });
  }

  updateById(requestId: string, data: RequestUpdateInput, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequest.update({
      where: { id: requestId },
      data,
      include: requestInclude,
    });
  }

  findById(requestId: string, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });
  }

  listByBuilding(
    orgId: string,
    buildingId: string,
    status?: MaintenanceRequestStatusEnum,
    assignedToUserId?: string,
  ) {
    return this.prisma.maintenanceRequest.findMany({
      where: {
        orgId,
        buildingId,
        ...(status ? { status } : {}),
        ...(assignedToUserId ? { assignedToUserId } : {}),
      },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdForBuilding(
    orgId: string,
    buildingId: string,
    requestId: string,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequest.findFirst({
      where: { id: requestId, orgId, buildingId },
      include: requestInclude,
    });
  }

  createComment(data: CommentCreateInput, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequestComment.create({
      data,
      include: {
        authorUser: true,
        authorOwner: true,
      },
    });
  }

  listComments(
    orgId: string | undefined,
    requestId: string,
    visibility?: Prisma.MaintenanceRequestCommentWhereInput['visibility'],
  ) {
    return this.prisma.maintenanceRequestComment.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        requestId,
        ...(visibility ? { visibility } : {}),
      },
      include: {
        authorUser: true,
        authorOwner: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  listCommentTimestamps(
    orgId: string | undefined,
    requestIds: string[],
    excludingAuthorUserId: string,
    visibility?: Prisma.MaintenanceRequestCommentWhereInput['visibility'],
    tx?: DbClient,
  ) {
    if (requestIds.length === 0) {
      return Promise.resolve([]);
    }

    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequestComment.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        requestId: { in: requestIds },
        authorUserId: { not: excludingAuthorUserId },
        ...(visibility ? { visibility } : {}),
      },
      select: {
        requestId: true,
        createdAt: true,
      },
    });
  }

  listCommentReadStates(
    userId: string,
    requestIds: string[],
    scope: MaintenanceRequestCommentReadScope,
    tx?: DbClient,
  ) {
    if (requestIds.length === 0) {
      return Promise.resolve([]);
    }

    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequestCommentReadState.findMany({
      where: {
        userId,
        requestId: { in: requestIds },
        scope,
      },
      select: {
        requestId: true,
        lastReadAt: true,
      },
    });
  }

  upsertCommentReadState(
    userId: string,
    requestId: string,
    scope: MaintenanceRequestCommentReadScope,
    lastReadAt: Date,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequestCommentReadState.upsert({
      where: {
        userId_requestId_scope: {
          userId,
          requestId,
          scope,
        },
      },
      update: {
        lastReadAt,
      },
      create: {
        userId,
        requestId,
        scope,
        lastReadAt,
      },
    });
  }

  findAssignedActiveOccupancy(userId: string, orgId: string, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.occupancy.findFirst({
      where: {
        residentUserId: userId,
        status: 'ACTIVE',
        building: { orgId },
      },
      orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      include: {
        building: true,
        unit: true,
        lease: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  }

  findActiveOccupancyForUnit(unitId: string) {
    return this.prisma.occupancy.findFirst({
      where: { unitId, status: 'ACTIVE' },
    });
  }

  findUserById(userId: string, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.user.findUnique({ where: { id: userId } });
  }

  findBuildingScopedAssignmentsForUser(
    buildingId: string,
    userId: string,
    orgId: string,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.userAccessAssignment.findMany({
      where: {
        userId,
        scopeType: 'BUILDING',
        scopeId: buildingId,
        roleTemplate: {
          orgId,
          scopeType: 'BUILDING',
        },
      },
      include: {
        roleTemplate: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
  }

  findServiceProviderById(providerId: string, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.serviceProvider.findUnique({
      where: {
        id: providerId,
      },
    });
  }

  findServiceProviderBuildingLink(
    providerId: string,
    buildingId: string,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.serviceProviderBuilding.findUnique({
      where: {
        serviceProviderId_buildingId: {
          serviceProviderId: providerId,
          buildingId,
        },
      },
    });
  }

  findServiceProviderUserMembership(
    providerId: string,
    userId: string,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.serviceProviderUser.findUnique({
      where: {
        serviceProviderId_userId: {
          serviceProviderId: providerId,
          userId,
        },
      },
      include: {
        user: true,
      },
    });
  }

  findActiveServiceProviderMembershipsForUser(userId: string, tx?: DbClient) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.serviceProviderUser.findMany({
      where: {
        userId,
        isActive: true,
        user: {
          isActive: true,
        },
        serviceProvider: {
          isActive: true,
        },
      },
      include: {
        serviceProvider: true,
      },
    });
  }

  listByServiceProviders(
    orgId: string | undefined,
    serviceProviderIds: string[],
    status?: MaintenanceRequestStatusEnum,
  ) {
    return this.prisma.maintenanceRequest.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        serviceProviderId: {
          in: serviceProviderIds,
        },
        ...(status ? { status } : {}),
      },
      include: providerRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByIdForServiceProviders(
    orgId: string | undefined,
    serviceProviderIds: string[],
    requestId: string,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequest.findFirst({
      where: {
        id: requestId,
        ...(orgId ? { orgId } : {}),
        serviceProviderId: {
          in: serviceProviderIds,
        },
      },
      include: providerRequestInclude,
    });
  }

  listPendingEstimateReminderRequests(now: Date, limit = 50) {
    return this.prisma.maintenanceRequest.findMany({
      where: {
        estimateStatus: 'REQUESTED',
        estimateDueAt: { lte: now },
        estimateReminderSentAt: null,
        status: {
          notIn: [
            MaintenanceRequestStatusEnum.COMPLETED,
            MaintenanceRequestStatusEnum.CANCELED,
          ],
        },
      },
      include: requestInclude,
      orderBy: { estimateDueAt: 'asc' },
      take: limit,
    });
  }

  markEstimateReminderSentIfPending(
    requestId: string,
    now: Date,
    tx?: DbClient,
  ) {
    const prisma: DbClient = tx ?? this.prisma;
    return prisma.maintenanceRequest.updateMany({
      where: {
        id: requestId,
        estimateStatus: 'REQUESTED',
        estimateDueAt: { lte: now },
        estimateReminderSentAt: null,
        status: {
          notIn: [
            MaintenanceRequestStatusEnum.COMPLETED,
            MaintenanceRequestStatusEnum.CANCELED,
          ],
        },
      },
      data: {
        estimateReminderSentAt: now,
      },
    });
  }

  private async createRequestWithAttachmentsInTx(
    prisma: DbClient,
    data: RequestCreateInput,
    attachments: AttachmentInput[],
  ) {
    const request = await prisma.maintenanceRequest.create({
      data,
      include: requestInclude,
    });

    if (attachments.length > 0) {
      await prisma.maintenanceRequestAttachment.createMany({
        data: attachments.map((attachment) => ({
          requestId: request.id,
          ...attachment,
        })),
      });
    }

    return request;
  }
}
