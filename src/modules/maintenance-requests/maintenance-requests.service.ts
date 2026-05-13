import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MaintenanceRequestCommentAuthorType,
  MaintenanceRequestCommentReadScope,
  MaintenanceRequestCommentVisibility,
  MaintenanceRequestOwnerApprovalDecisionSource,
  MaintenanceRequestOwnerApprovalStatus,
  MaintenanceRequestPriority,
  MaintenanceRequestStatus,
  MaintenanceRequestType,
  Prisma,
} from '@prisma/client';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthenticatedUser } from '../../common/types/request-context';
import { assertOrgScope } from '../../common/utils/org-scope';
import { BuildingAccessService } from '../../common/building-access/building-access.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ProviderAccessService } from '../service-providers/provider-access.service';
import { MaintenanceRequestsRepo } from './maintenance-requests.repo';
import { CreateResidentRequestDto } from './dto/create-resident-request.dto';
import { UpdateResidentRequestDto } from './dto/update-resident-request.dto';
import { AssignRequestDto } from './dto/assign-request.dto';
import { AssignProviderRequestDto } from './dto/assign-provider-request.dto';
import { AssignProviderWorkerDto } from './dto/assign-provider-worker.dto';
import { ListBuildingRequestsQueryDto } from './dto/list-building-requests.query.dto';
import { ListProviderRequestsQueryDto } from './dto/list-provider-requests.query.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { CreateRequestCommentDto } from './dto/create-request-comment.dto';
import { CreateBuildingRequestCommentDto } from './dto/create-building-request-comment.dto';
import { CreateRequestAttachmentsDto } from './dto/create-request-attachments.dto';
import {
  OverrideOwnerApprovalDto,
  RequireOwnerApprovalDto,
  SubmitRequestEstimateDto,
  UpdateRequestPolicyDto,
} from './dto/require-owner-approval.dto';
import {
  getMaintenanceRequestPolicyRoute,
  getPrimaryMaintenanceRequestQueue,
} from './maintenance-request-policy';
import {
  MaintenanceRequestEstimateStatusEnum,
  MaintenanceRequestEmergencySignalEnum,
  MaintenanceRequestOwnerApprovalAuditActionEnum,
  MaintenanceRequestOwnerApprovalDecisionSourceEnum,
  MaintenanceRequestOwnerApprovalStatusEnum,
  MaintenanceRequestPolicyRouteEnum,
  MaintenanceRequestStatusEnum,
  MAINTENANCE_STATUS_TRANSITIONS,
  OWNER_APPROVAL_BLOCKING_STATUSES,
} from './maintenance-requests.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { env } from '../../config/env';
import {
  MAINTENANCE_REQUEST_EVENTS,
  MaintenanceRequestEventPayload,
  MaintenanceRequestSnapshot,
} from './maintenance-requests.events';
import {
  buildRequesterContextMap,
  getRequesterContextOrDefault,
} from './requester-context.enricher';
import {
  buildRequestTenancyContextMap,
  getRequestTenancyContextOrDefault,
} from './request-tenancy-context.enricher';

const REQUEST_ASSIGN_PERMISSION = 'requests.assign';
const REQUEST_OWNER_APPROVAL_OVERRIDE_PERMISSION =
  'requests.owner_approval_override';
const REQUEST_HANDLING_PERMISSIONS = [
  'requests.read',
  'requests.comment',
  'requests.update_status',
] as const;

@Injectable()
export class MaintenanceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsRepo: MaintenanceRequestsRepo,
    private readonly buildingAccessService: BuildingAccessService,
    private readonly accessControlService: AccessControlService,
    private readonly providerAccessService: ProviderAccessService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createResidentRequest(
    user: AuthenticatedUser | undefined,
    dto: CreateResidentRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const occupancy = await this.requireActiveResidentOccupancy(
        userId,
        orgId,
        tx,
      );

      const attachments =
        dto.attachments?.map((attachment) => ({
          orgId,
          uploadedByUserId: userId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          url: attachment.url,
        })) ?? [];
      const emergencySignals = this.normalizeEmergencySignals(
        dto.emergencySignals,
      );
      const createData = {
        org: { connect: { id: orgId } },
        building: { connect: { id: occupancy.buildingId } },
        unit: { connect: { id: occupancy.unitId } },
        occupancyAtCreation: { connect: { id: occupancy.id } },
        ...(occupancy.lease?.id && occupancy.lease.status === 'ACTIVE'
          ? { leaseAtCreation: { connect: { id: occupancy.lease.id } } }
          : {}),
        createdByUser: { connect: { id: userId } },
        title: dto.title,
        description: dto.description,
        type: this.normalizeType(dto.type),
        priority: this.normalizePriority(dto.priority),
        status: MaintenanceRequestStatusEnum.OPEN,
        isEmergency: dto.isEmergency === true || emergencySignals.length > 0,
        emergencySignals,
      } as Prisma.MaintenanceRequestCreateInput;

      const request = await this.requestsRepo.createRequestWithAttachments(
        createData,
        attachments,
        tx,
      );
      return request;
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.CREATED, {
      request: this.toEventRequest(request),
      actorUserId: userId,
    });

    return this.withRequesterContext(request);
  }

  async listResidentRequests(user: AuthenticatedUser | undefined) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.requireActiveResidentOccupancy(userId, orgId);
    const requests = await this.requestsRepo.listByCreator(orgId, userId);
    return this.withRequesterContextList(requests);
  }

  async getResidentRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.requireActiveResidentOccupancy(userId, orgId);

    const request = await this.requestsRepo.findByIdForCreator(
      orgId,
      userId,
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return this.withRequesterContext(request);
  }

  async updateResidentRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: UpdateResidentRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.requireActiveResidentOccupancy(userId, orgId);

    const request = await this.requestsRepo.findByIdForCreator(
      orgId,
      userId,
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== MaintenanceRequestStatusEnum.OPEN) {
      throw new ConflictException('Request cannot be edited');
    }

    if (
      dto.title === undefined &&
      dto.description === undefined &&
      dto.type === undefined &&
      dto.priority === undefined &&
      dto.isEmergency === undefined &&
      dto.emergencySignals === undefined
    ) {
      throw new BadRequestException('No changes provided');
    }

    const emergencySignals =
      dto.emergencySignals !== undefined
        ? this.normalizeEmergencySignals(dto.emergencySignals)
        : (request.emergencySignals ?? []);
    const isEmergency =
      dto.isEmergency !== undefined || dto.emergencySignals !== undefined
        ? dto.isEmergency === true || emergencySignals.length > 0
        : (request.isEmergency ?? false);

    const updated = await this.requestsRepo.updateById(request.id, {
      title: dto.title ?? request.title,
      description: dto.description ?? request.description,
      type:
        dto.type !== undefined
          ? this.normalizeType(dto.type)
          : (request.type ?? undefined),
      priority:
        dto.priority !== undefined
          ? this.normalizePriority(dto.priority)
          : (request.priority ?? undefined),
      isEmergency,
      emergencySignals,
    });
    return this.withRequesterContext(updated);
  }

  async cancelResidentRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.requireActiveResidentOccupancy(userId, orgId, tx);

      const request = await this.requestsRepo.findByIdForCreator(
        orgId,
        userId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status === MaintenanceRequestStatusEnum.COMPLETED ||
        request.status === MaintenanceRequestStatusEnum.CANCELED
      ) {
        throw new ConflictException('Request cannot be canceled');
      }

      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          status: MaintenanceRequestStatusEnum.CANCELED,
          canceledAt: new Date(),
        },
        tx,
      );
      return updated;
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.CANCELED, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return this.withRequesterContext(updated);
  }

  async addResidentComment(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: CreateRequestCommentDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const { request, comment } = await this.prisma.$transaction(async (tx) => {
      await this.requireActiveResidentOccupancy(userId, orgId, tx);

      const request = await this.requestsRepo.findByIdForCreator(
        orgId,
        userId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status === MaintenanceRequestStatusEnum.CANCELED ||
        request.status === MaintenanceRequestStatusEnum.COMPLETED
      ) {
        throw new ConflictException('Request is closed');
      }

      const comment = await this.requestsRepo.createComment(
        {
          request: { connect: { id: request.id } },
          org: { connect: { id: orgId } },
          authorUser: { connect: { id: userId } },
          authorType: MaintenanceRequestCommentAuthorType.TENANT,
          visibility: MaintenanceRequestCommentVisibility.SHARED,
          message: dto.message,
        },
        tx,
      );

      return { request, comment };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.COMMENTED, {
      request: this.toEventRequest(request),
      actorUserId: userId,
      actorIsResident: true,
      comment: { id: comment.id, message: comment.message },
    });

    return comment;
  }

  async listResidentComments(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.requireActiveResidentOccupancy(userId, orgId);

    const request = await this.requestsRepo.findByIdForCreator(
      orgId,
      userId,
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return this.requestsRepo.listComments(
      orgId,
      request.id,
      MaintenanceRequestCommentVisibility.SHARED,
    );
  }

  async listBuildingRequests(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    query?: ListBuildingRequestsQueryDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    const assignedToUserId = accessContext.isBuildingStaffOnly
      ? userId
      : undefined;
    const requests = await this.requestsRepo.listByBuilding(
      orgId,
      buildingId,
      query?.status,
      assignedToUserId,
    );
    const filtered = requests.filter((request) => {
      if (
        query?.ownerApprovalStatus &&
        request.ownerApprovalStatus !== query.ownerApprovalStatus
      ) {
        return false;
      }
      if (
        query?.queue &&
        getPrimaryMaintenanceRequestQueue(request) !== query.queue
      ) {
        return false;
      }
      return true;
    });

    return this.withRequesterContextList(filtered);
  }

  async getBuildingRequest(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const request = await this.requestsRepo.findByIdForBuilding(
      orgId,
      buildingId,
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (
      accessContext.isBuildingStaffOnly &&
      request.assignedToUserId !== userId
    ) {
      throw new ForbiddenException('Forbidden');
    }

    return this.withRequesterContext(request);
  }

  async assignRequest(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: AssignRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot assign requests');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status !== MaintenanceRequestStatusEnum.OPEN &&
        request.status !== MaintenanceRequestStatusEnum.ASSIGNED
      ) {
        throw new ConflictException('Request is not open or assigned');
      }
      this.assertExecutionUnlocked(request);

      const staffUser = await this.requestsRepo.findUserById(
        dto.staffUserId,
        tx,
      );
      if (!staffUser || !staffUser.isActive || staffUser.orgId !== orgId) {
        throw new BadRequestException('Staff user not in org');
      }

      const staffAssignments =
        await this.requestsRepo.findBuildingScopedAssignmentsForUser(
          buildingId,
          staffUser.id,
          orgId,
          tx,
        );
      const canHandleAssignedRequests = staffAssignments.some((assignment) =>
        this.assignmentHasPermissions(assignment.roleTemplate.rolePermissions, [
          ...REQUEST_HANDLING_PERMISSIONS,
        ]),
      );
      if (!canHandleAssignedRequests) {
        throw new BadRequestException(
          'Staff user lacks building-scoped request handling access',
        );
      }

      const hasScopedAssignment = staffAssignments.length > 0;
      if (!hasScopedAssignment) {
        throw new BadRequestException('Staff user not assigned to building');
      }

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          assignedToUser: { connect: { id: staffUser.id } },
          serviceProvider: { disconnect: true },
          serviceProviderAssignedUser: { disconnect: true },
          assignedAt: new Date(),
          status: MaintenanceRequestStatusEnum.ASSIGNED,
        },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.ASSIGNED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  async assignProvider(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: AssignProviderRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot assign requests');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status !== MaintenanceRequestStatusEnum.OPEN &&
        request.status !== MaintenanceRequestStatusEnum.ASSIGNED
      ) {
        throw new ConflictException('Request is not open or assigned');
      }
      this.assertExecutionUnlocked(request);

      const provider = await this.requestsRepo.findServiceProviderById(
        dto.serviceProviderId,
        tx,
      );
      if (!provider || !provider.isActive) {
        throw new BadRequestException('Service provider not found or inactive');
      }

      const buildingLink =
        await this.requestsRepo.findServiceProviderBuildingLink(
          provider.id,
          buildingId,
          tx,
        );
      if (!buildingLink) {
        throw new BadRequestException(
          'Service provider not linked to building',
        );
      }

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          assignedToUser: { disconnect: true },
          serviceProvider: { connect: { id: provider.id } },
          serviceProviderAssignedUser: { disconnect: true },
          assignedAt: new Date(),
          status: MaintenanceRequestStatusEnum.ASSIGNED,
        },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.ASSIGNED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  async requestEstimateFromProvider(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: AssignProviderRequestDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot request estimates');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status !== MaintenanceRequestStatusEnum.OPEN &&
        request.status !== MaintenanceRequestStatusEnum.ASSIGNED
      ) {
        throw new ConflictException('Request is not open or assigned');
      }

      const route = getMaintenanceRequestPolicyRoute(request);
      if (
        request.ownerApprovalStatus ===
        MaintenanceRequestOwnerApprovalStatusEnum.PENDING
      ) {
        throw new ConflictException(
          'Estimate request is not allowed while owner approval is pending',
        );
      }
      if (
        route !== MaintenanceRequestPolicyRouteEnum.NEEDS_ESTIMATE &&
        request.ownerApprovalStatus !==
          MaintenanceRequestOwnerApprovalStatusEnum.REJECTED
      ) {
        throw new ConflictException(
          'Estimate request is only allowed while the request is awaiting an estimate',
        );
      }

      const provider = await this.requestsRepo.findServiceProviderById(
        dto.serviceProviderId,
        tx,
      );
      if (!provider || !provider.isActive) {
        throw new BadRequestException('Service provider not found or inactive');
      }

      const buildingLink =
        await this.requestsRepo.findServiceProviderBuildingLink(
          provider.id,
          buildingId,
          tx,
        );
      if (!buildingLink) {
        throw new BadRequestException(
          'Service provider not linked to building',
        );
      }

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          assignedToUser: { disconnect: true },
          serviceProvider: { connect: { id: provider.id } },
          serviceProviderAssignedUser: { disconnect: true },
          estimateStatus: MaintenanceRequestEstimateStatusEnum.REQUESTED,
          estimateRequestedAt: new Date(),
          estimateRequestedByUser: { connect: { id: userId } },
          estimateDueAt: this.buildEstimateDueAt(),
          estimateReminderSentAt: null,
          estimateSubmittedAt: null,
          estimateSubmittedByUser: { disconnect: true },
          assignedAt: null,
          estimatedAmount: null,
          estimatedCurrency: null,
          ownerApprovalStatus:
            MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
          ownerApprovalRequestedAt: null,
          ownerApprovalRequestedByUser: { disconnect: true },
          ownerApprovalDeadlineAt: null,
          ownerApprovalReason: null,
          approvalRequiredReason: null,
          ownerApprovalDecidedAt: null,
          ownerApprovalDecidedByOwnerUser: { disconnect: true },
          ownerApprovalDecisionSource: null,
          ownerApprovalOverrideReason: null,
          ownerApprovalOverriddenByUser: { disconnect: true },
          status: MaintenanceRequestStatusEnum.OPEN,
        },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.ASSIGNED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  async assignProviderWorker(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: AssignProviderWorkerDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot assign requests');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status !== MaintenanceRequestStatusEnum.OPEN &&
        request.status !== MaintenanceRequestStatusEnum.ASSIGNED
      ) {
        throw new ConflictException('Request is not open or assigned');
      }
      this.assertExecutionUnlocked(request);

      if (!request.serviceProviderId) {
        throw new ConflictException(
          'Request must be assigned to a service provider first',
        );
      }
      if (!request.serviceProvider?.isActive) {
        throw new BadRequestException(
          'Assigned service provider is no longer active',
        );
      }

      const membership =
        await this.requestsRepo.findServiceProviderUserMembership(
          request.serviceProviderId,
          dto.userId,
          tx,
        );

      if (!membership || !membership.isActive || !membership.user.isActive) {
        throw new BadRequestException(
          'User is not an active member of the assigned service provider',
        );
      }

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          assignedToUser: { disconnect: true },
          serviceProviderAssignedUser: { connect: { id: membership.userId } },
          assignedAt: request.assignedAt ?? new Date(),
          status: MaintenanceRequestStatusEnum.ASSIGNED,
        },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.ASSIGNED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  async unassignProvider(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot assign requests');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status !== MaintenanceRequestStatusEnum.OPEN &&
        request.status !== MaintenanceRequestStatusEnum.ASSIGNED
      ) {
        throw new ConflictException('Request is not open or assigned');
      }
      if (!request.serviceProviderId) {
        throw new ConflictException(
          'Request is not assigned to a service provider',
        );
      }
      this.assertExecutionUnlocked(request);

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        request.estimateStatus ===
          MaintenanceRequestEstimateStatusEnum.REQUESTED
          ? {
              serviceProvider: { disconnect: true },
              serviceProviderAssignedUser: { disconnect: true },
              estimateStatus:
                MaintenanceRequestEstimateStatusEnum.NOT_REQUESTED,
              estimateRequestedAt: null,
              estimateRequestedByUser: { disconnect: true },
              estimateDueAt: null,
              estimateReminderSentAt: null,
              estimateSubmittedAt: null,
              estimateSubmittedByUser: { disconnect: true },
              estimatedAmount: null,
              estimatedCurrency: null,
              assignedAt: null,
              status: MaintenanceRequestStatusEnum.OPEN,
            }
          : {
              serviceProvider: { disconnect: true },
              serviceProviderAssignedUser: { disconnect: true },
              assignedAt: null,
              status: MaintenanceRequestStatusEnum.OPEN,
            },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.STATUS_CHANGED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  async updateRequestStatus(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: UpdateRequestStatusDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }

      const currentStatus = request.status as MaintenanceRequestStatusEnum;
      if (
        !MAINTENANCE_STATUS_TRANSITIONS[currentStatus]?.includes(dto.status)
      ) {
        throw new ConflictException('Invalid status transition');
      }

      if (accessContext.isBuildingStaffOnly) {
        if (request.assignedToUserId !== userId) {
          throw new ForbiddenException('Forbidden');
        }
      }
      this.assertExecutionUnlocked(request);

      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          status: dto.status,
          completedAt:
            dto.status === MaintenanceRequestStatusEnum.COMPLETED
              ? new Date()
              : request.completedAt,
        },
        tx,
      );
      return updated;
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.STATUS_CHANGED, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return this.withRequesterContext(updated);
  }

  async requireOwnerApproval(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: RequireOwnerApprovalDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );
    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot request owner approval');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (!request.unitId) {
        throw new ConflictException(
          'Owner approval requires a request linked to a unit',
        );
      }
      this.assertRequestOpenForApproval(request);

      const previousStatus = request.ownerApprovalStatus;
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.PENDING,
          approvalRequiredReason: dto.approvalRequiredReason,
          ...this.buildPolicyTriageUpdateData(dto, request),
          ownerApprovalRequestedAt: null,
          ownerApprovalRequestedByUser: { disconnect: true },
          ownerApprovalDeadlineAt: dto.ownerApprovalDeadlineAt
            ? new Date(dto.ownerApprovalDeadlineAt)
            : request.ownerApprovalDeadlineAt,
          ownerApprovalReason: null,
          ownerApprovalDecidedAt: null,
          ownerApprovalDecidedByOwnerUser: { disconnect: true },
          ownerApprovalDecisionSource: null,
          ownerApprovalOverrideReason: null,
          ownerApprovalOverriddenByUser: { disconnect: true },
        },
        tx,
      );

      await this.createOwnerApprovalAudit(
        tx,
        updated.id,
        updated.orgId,
        userId,
        MaintenanceRequestOwnerApprovalAuditActionEnum.REQUIRED,
        previousStatus,
        MaintenanceRequestOwnerApprovalStatus.PENDING,
        dto.approvalRequiredReason,
      );

      return updated;
    });

    return this.withRequesterContext(updated);
  }

  async requestOwnerApprovalNow(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: RequireOwnerApprovalDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );
    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot request owner approval');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (!request.unitId) {
        throw new ConflictException(
          'Owner approval requires a request linked to a unit',
        );
      }
      this.assertRequestOpenForApproval(request);

      if (
        request.ownerApprovalStatus ===
          MaintenanceRequestOwnerApprovalStatusEnum.PENDING &&
        request.ownerApprovalRequestedAt
      ) {
        throw new ConflictException(
          'Owner approval has already been requested; use resend instead',
        );
      }

      const previousStatus = request.ownerApprovalStatus;
      const nextStatus = MaintenanceRequestOwnerApprovalStatus.PENDING;
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          ownerApprovalStatus: nextStatus,
          approvalRequiredReason: dto.approvalRequiredReason,
          ...this.buildPolicyTriageUpdateData(dto, request),
          ownerApprovalRequestedAt: new Date(),
          ownerApprovalRequestedByUser: { connect: { id: userId } },
          ownerApprovalDeadlineAt: dto.ownerApprovalDeadlineAt
            ? new Date(dto.ownerApprovalDeadlineAt)
            : request.ownerApprovalDeadlineAt,
          ownerApprovalReason: null,
          ownerApprovalDecidedAt: null,
          ownerApprovalDecidedByOwnerUser: { disconnect: true },
          ownerApprovalDecisionSource: null,
          ownerApprovalOverrideReason: null,
          ownerApprovalOverriddenByUser: { disconnect: true },
        },
        tx,
      );

      if (
        previousStatus !== MaintenanceRequestOwnerApprovalStatusEnum.PENDING
      ) {
        await this.createOwnerApprovalAudit(
          tx,
          updated.id,
          updated.orgId,
          userId,
          MaintenanceRequestOwnerApprovalAuditActionEnum.REQUIRED,
          previousStatus,
          nextStatus,
          dto.approvalRequiredReason,
        );
      }

      await this.createOwnerApprovalAudit(
        tx,
        updated.id,
        updated.orgId,
        userId,
        MaintenanceRequestOwnerApprovalAuditActionEnum.REQUESTED,
        nextStatus,
        nextStatus,
        dto.approvalRequiredReason,
      );

      return updated;
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REQUESTED, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return this.withRequesterContext(updated);
  }

  async requestOwnerApproval(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
  ) {
    return this.markOwnerApprovalRequested(
      user,
      buildingId,
      requestId,
      MaintenanceRequestOwnerApprovalAuditActionEnum.REQUESTED,
      false,
    );
  }

  async resendOwnerApprovalRequest(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
  ) {
    return this.markOwnerApprovalRequested(
      user,
      buildingId,
      requestId,
      MaintenanceRequestOwnerApprovalAuditActionEnum.RESENT,
      true,
    );
  }

  async updateRequestPolicyTriage(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: UpdateRequestPolicyDto,
  ) {
    this.ensureRequestPolicyPayload(dto);

    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );
    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot update request triage');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      this.assertRequestOpenForApproval(request);

      return this.requestsRepo.updateById(
        request.id,
        this.buildPolicyTriageUpdateData(dto, request),
        tx,
      );
    });

    return this.withRequesterContext(updated);
  }

  async submitRequestEstimate(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: SubmitRequestEstimateDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );
    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot submit request estimates');
    }

    const { updated, shouldEmitOwnerApprovalRequested } =
      await this.prisma.$transaction(async (tx) => {
        const request = await this.requestsRepo.findByIdForBuilding(
          orgId,
          buildingId,
          requestId,
          tx,
        );
        if (!request) {
          throw new NotFoundException('Request not found');
        }
        return this.submitRequestEstimateInTx(tx, request, userId, dto);
      });

    if (shouldEmitOwnerApprovalRequested) {
      this.emitEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REQUESTED, {
        request: this.toEventRequest(updated),
        actorUserId: userId,
      });
    }

    return this.withRequesterContext(updated);
  }

  async submitProviderRequestEstimate(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: SubmitRequestEstimateDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);

    const { updated, shouldEmitOwnerApprovalRequested } =
      await this.prisma.$transaction(async (tx) => {
        const request = await this.requestsRepo.findByIdForServiceProviders(
          undefined,
          Array.from(accessContext.providerIds),
          requestId,
          tx,
        );
        if (!request) {
          throw new NotFoundException('Request not found');
        }

        this.assertProviderRequestWriteAccess(userId, accessContext, request);

        return this.submitRequestEstimateInTx(tx, request, userId, dto);
      });

    if (shouldEmitOwnerApprovalRequested) {
      this.emitEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REQUESTED, {
        request: this.toEventRequest(updated),
        actorUserId: userId,
      });
    }

    return this.withRequesterContext(updated);
  }

  async overrideOwnerApproval(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: OverrideOwnerApprovalDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);
    await this.assertOverridePermission(userId, orgId, buildingId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.ownerApprovalStatus !==
        MaintenanceRequestOwnerApprovalStatusEnum.PENDING
      ) {
        throw new ConflictException(
          'Only pending owner approvals can be overridden',
        );
      }

      if (
        dto.decisionSource ===
        MaintenanceRequestOwnerApprovalDecisionSourceEnum.MANAGEMENT_OVERRIDE
      ) {
        if (
          !request.ownerApprovalDeadlineAt ||
          request.ownerApprovalDeadlineAt.getTime() > Date.now()
        ) {
          throw new ConflictException(
            'Urgent override requires an expired owner approval deadline',
          );
        }
      }

      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.APPROVED,
          ownerApprovalDecidedAt: new Date(),
          ownerApprovalDecidedByOwnerUser: { disconnect: true },
          ownerApprovalReason: null,
          ownerApprovalDecisionSource:
            dto.decisionSource as MaintenanceRequestOwnerApprovalDecisionSource,
          ownerApprovalOverrideReason: dto.ownerApprovalOverrideReason,
          ownerApprovalOverriddenByUser: { connect: { id: userId } },
        },
        tx,
      );

      await this.createOwnerApprovalAudit(
        tx,
        updated.id,
        updated.orgId,
        userId,
        MaintenanceRequestOwnerApprovalAuditActionEnum.OVERRIDDEN,
        request.ownerApprovalStatus,
        MaintenanceRequestOwnerApprovalStatus.APPROVED,
        dto.ownerApprovalOverrideReason,
        dto.decisionSource as MaintenanceRequestOwnerApprovalDecisionSource,
      );

      return updated;
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.OWNER_REQUEST_OVERRIDDEN, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return this.withRequesterContext(updated);
  }

  async cancelBuildingRequest(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (!accessContext.hasAnyBuildingAccess) {
      const hasPermission = await this.hasGlobalPermission(
        userId,
        orgId,
        'requests.update_status',
      );
      if (!hasPermission) {
        throw new ForbiddenException('Forbidden');
      }
    }

    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot cancel requests');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status === MaintenanceRequestStatusEnum.COMPLETED ||
        request.status === MaintenanceRequestStatusEnum.CANCELED
      ) {
        throw new ConflictException('Request cannot be canceled');
      }

      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          status: MaintenanceRequestStatusEnum.CANCELED,
          canceledAt: new Date(),
        },
        tx,
      );
      return updated;
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.CANCELED, {
      request: this.toEventRequest(updated),
      actorUserId: userId,
    });

    return this.withRequesterContext(updated);
  }

  async addBuildingComment(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: CreateBuildingRequestCommentDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    const { request, comment } = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (
        accessContext.isBuildingStaffOnly &&
        request.assignedToUserId !== userId
      ) {
        throw new ForbiddenException('Forbidden');
      }

      const comment = await this.requestsRepo.createComment(
        {
          request: { connect: { id: request.id } },
          org: { connect: { id: orgId } },
          authorUser: { connect: { id: userId } },
          authorType: MaintenanceRequestCommentAuthorType.STAFF,
          visibility:
            (dto.visibility as
              | MaintenanceRequestCommentVisibility
              | undefined) ?? MaintenanceRequestCommentVisibility.SHARED,
          message: dto.message,
        },
        tx,
      );

      await this.requestsRepo.upsertCommentReadState(
        userId,
        request.id,
        MaintenanceRequestCommentReadScope.BUILDING,
        comment.createdAt,
        tx,
      );

      return { request, comment };
    });

    if (comment.visibility === MaintenanceRequestCommentVisibility.SHARED) {
      this.emitEvent(MAINTENANCE_REQUEST_EVENTS.COMMENTED, {
        request: this.toEventRequest(request),
        actorUserId: userId,
        actorIsResident: false,
        comment: { id: comment.id, message: comment.message },
      });
    }

    return comment;
  }

  async listBuildingComments(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const request = await this.requestsRepo.findByIdForBuilding(
      orgId,
      buildingId,
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    if (
      accessContext.isBuildingStaffOnly &&
      request.assignedToUserId !== userId
    ) {
      throw new ForbiddenException('Forbidden');
    }

    const comments = await this.requestsRepo.listComments(orgId, request.id);
    const lastCommentCreatedAt = comments[comments.length - 1]?.createdAt;
    if (lastCommentCreatedAt) {
      await this.requestsRepo.upsertCommentReadState(
        userId,
        request.id,
        MaintenanceRequestCommentReadScope.BUILDING,
        lastCommentCreatedAt,
      );
    }

    return comments;
  }

  async countUnreadBuildingComments(
    user: AuthenticatedUser | undefined,
    buildingId: string,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );
    const assignedToUserId = accessContext.isBuildingStaffOnly
      ? userId
      : undefined;
    const requests = await this.requestsRepo.listByBuilding(
      orgId,
      buildingId,
      undefined,
      assignedToUserId,
    );

    return this.countUnreadCommentsForRequests(
      userId,
      orgId,
      requests.map((request) => request.id),
      MaintenanceRequestCommentReadScope.BUILDING,
    );
  }

  async addBuildingAttachments(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    dto: CreateRequestAttachmentsDto,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (
        request.status === MaintenanceRequestStatus.CANCELED ||
        request.status === MaintenanceRequestStatus.COMPLETED
      ) {
        throw new ConflictException('Request is closed');
      }

      if (
        accessContext.isBuildingStaffOnly &&
        request.assignedToUserId !== userId
      ) {
        throw new ForbiddenException('Forbidden');
      }

      await this.requestsRepo.createAttachments(
        request.id,
        dto.attachments.map((attachment) => ({
          orgId,
          uploadedByUserId: userId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          url: attachment.url,
        })),
        tx,
      );

      const updated = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!updated) {
        throw new NotFoundException('Request not found');
      }
      return updated;
    });

    return this.withRequesterContext(updated);
  }

  async listProviderRequests(
    user: AuthenticatedUser | undefined,
    query: ListProviderRequestsQueryDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);
    if (
      query.serviceProviderId &&
      !accessContext.providerIds.has(query.serviceProviderId)
    ) {
      throw new ForbiddenException('Forbidden');
    }

    const providerIds = query.serviceProviderId
      ? [query.serviceProviderId]
      : Array.from(accessContext.providerIds);

    const requests = await this.requestsRepo.listByServiceProviders(
      undefined,
      providerIds,
      query.status,
    );

    return this.withRequesterContextList(requests);
  }

  async getProviderRequest(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);
    const request = await this.requestsRepo.findByIdForServiceProviders(
      undefined,
      Array.from(accessContext.providerIds),
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return this.withRequesterContext(request);
  }

  async updateProviderRequestStatus(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: UpdateRequestStatusDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForServiceProviders(
        undefined,
        Array.from(accessContext.providerIds),
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }

      this.assertProviderRequestWriteAccess(userId, accessContext, request);

      const currentStatus = request.status as MaintenanceRequestStatusEnum;
      if (
        !MAINTENANCE_STATUS_TRANSITIONS[currentStatus]?.includes(dto.status)
      ) {
        throw new ConflictException('Invalid status transition');
      }
      this.assertExecutionUnlocked(request);

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          status: dto.status,
          completedAt:
            dto.status === MaintenanceRequestStatusEnum.COMPLETED
              ? new Date()
              : request.completedAt,
        },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.STATUS_CHANGED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  async addProviderComment(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: CreateRequestCommentDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);

    const { request, comment } = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForServiceProviders(
        undefined,
        Array.from(accessContext.providerIds),
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status === MaintenanceRequestStatusEnum.CANCELED ||
        request.status === MaintenanceRequestStatusEnum.COMPLETED
      ) {
        throw new ConflictException('Request is closed');
      }

      this.assertProviderRequestWriteAccess(userId, accessContext, request);

      const comment = await this.requestsRepo.createComment(
        {
          request: { connect: { id: request.id } },
          org: { connect: { id: request.orgId } },
          authorUser: { connect: { id: userId } },
          authorType: MaintenanceRequestCommentAuthorType.STAFF,
          visibility: MaintenanceRequestCommentVisibility.SHARED,
          message: dto.message,
        },
        tx,
      );

      await this.requestsRepo.upsertCommentReadState(
        userId,
        request.id,
        MaintenanceRequestCommentReadScope.PROVIDER,
        comment.createdAt,
        tx,
      );

      return { request, comment };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.COMMENTED, {
      request: this.toEventRequest(request),
      actorUserId: userId,
      actorIsResident: false,
      comment: { id: comment.id, message: comment.message },
    });

    return comment;
  }

  async listProviderComments(
    user: AuthenticatedUser | undefined,
    requestId: string,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);
    const request = await this.requestsRepo.findByIdForServiceProviders(
      undefined,
      Array.from(accessContext.providerIds),
      requestId,
    );
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const comments = await this.requestsRepo.listComments(
      request.orgId,
      request.id,
      MaintenanceRequestCommentVisibility.SHARED,
    );
    const lastCommentCreatedAt = comments[comments.length - 1]?.createdAt;
    if (lastCommentCreatedAt) {
      await this.requestsRepo.upsertCommentReadState(
        userId,
        request.id,
        MaintenanceRequestCommentReadScope.PROVIDER,
        lastCommentCreatedAt,
      );
    }

    return comments;
  }

  async countUnreadProviderComments(user: AuthenticatedUser | undefined) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);
    const requests = await this.requestsRepo.listByServiceProviders(
      undefined,
      Array.from(accessContext.providerIds),
    );

    return this.countUnreadCommentsForRequests(
      userId,
      undefined,
      requests.map((request) => request.id),
      MaintenanceRequestCommentReadScope.PROVIDER,
      MaintenanceRequestCommentVisibility.SHARED,
    );
  }

  async addProviderAttachments(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: CreateRequestAttachmentsDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForServiceProviders(
        undefined,
        Array.from(accessContext.providerIds),
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.status === MaintenanceRequestStatus.CANCELED ||
        request.status === MaintenanceRequestStatus.COMPLETED
      ) {
        throw new ConflictException('Request is closed');
      }

      this.assertProviderRequestWriteAccess(userId, accessContext, request);

      await this.requestsRepo.createAttachments(
        request.id,
        dto.attachments.map((attachment) => ({
          orgId: request.orgId,
          uploadedByUserId: userId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          url: attachment.url,
        })),
        tx,
      );

      const updated = await this.requestsRepo.findByIdForServiceProviders(
        undefined,
        Array.from(accessContext.providerIds),
        requestId,
        tx,
      );
      if (!updated) {
        throw new NotFoundException('Request not found');
      }
      return updated;
    });

    return this.withRequesterContext(updated);
  }

  async assignProviderWorkerFromProvider(
    user: AuthenticatedUser | undefined,
    requestId: string,
    dto: AssignProviderWorkerDto,
  ) {
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessContext = await this.getProviderAccessContext(userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForServiceProviders(
        undefined,
        Array.from(accessContext.providerIds),
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (!request.serviceProviderId) {
        throw new ConflictException(
          'Request must be assigned to a service provider first',
        );
      }
      if (!accessContext.managerProviderIds.has(request.serviceProviderId)) {
        throw new ForbiddenException('Forbidden');
      }
      if (
        request.status !== MaintenanceRequestStatusEnum.OPEN &&
        request.status !== MaintenanceRequestStatusEnum.ASSIGNED
      ) {
        throw new ConflictException('Request is not open or assigned');
      }
      this.assertExecutionUnlocked(request);

      const membership =
        await this.requestsRepo.findServiceProviderUserMembership(
          request.serviceProviderId,
          dto.userId,
          tx,
        );

      if (!membership || !membership.isActive || !membership.user.isActive) {
        throw new BadRequestException(
          'User is not an active member of the assigned service provider',
        );
      }

      const previousRequest = this.toEventRequest(request);
      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          assignedToUser: { disconnect: true },
          serviceProviderAssignedUser: { connect: { id: membership.userId } },
          assignedAt: request.assignedAt ?? new Date(),
          status: MaintenanceRequestStatusEnum.ASSIGNED,
        },
        tx,
      );
      return { updated, previousRequest };
    });

    this.emitEvent(MAINTENANCE_REQUEST_EVENTS.ASSIGNED, {
      request: this.toEventRequest(updated.updated),
      previousRequest: updated.previousRequest,
      actorUserId: userId,
    });

    return this.withRequesterContext(updated.updated);
  }

  private async markOwnerApprovalRequested(
    user: AuthenticatedUser | undefined,
    buildingId: string,
    requestId: string,
    action:
      | MaintenanceRequestOwnerApprovalAuditActionEnum.REQUESTED
      | MaintenanceRequestOwnerApprovalAuditActionEnum.RESENT,
    requiresExistingRequest: boolean,
  ) {
    const orgId = assertOrgScope(user);
    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.buildingAccessService.assertBuildingInOrg(buildingId, orgId);

    const accessContext = await this.getBuildingAccessContext(
      userId,
      orgId,
      buildingId,
    );
    if (accessContext.isBuildingStaffOnly) {
      throw new ForbiddenException('Staff cannot request owner approval');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await this.requestsRepo.findByIdForBuilding(
        orgId,
        buildingId,
        requestId,
        tx,
      );
      if (!request) {
        throw new NotFoundException('Request not found');
      }
      if (
        request.ownerApprovalStatus !==
        MaintenanceRequestOwnerApprovalStatusEnum.PENDING
      ) {
        throw new ConflictException(
          'Owner approval must be pending before it can be requested',
        );
      }
      if (requiresExistingRequest && !request.ownerApprovalRequestedAt) {
        throw new ConflictException(
          'Owner approval has not been requested yet',
        );
      }
      if (!requiresExistingRequest && request.ownerApprovalRequestedAt) {
        throw new ConflictException(
          'Owner approval has already been requested; use resend instead',
        );
      }

      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          ownerApprovalRequestedAt: new Date(),
          ownerApprovalRequestedByUser: { connect: { id: userId } },
        },
        tx,
      );

      await this.createOwnerApprovalAudit(
        tx,
        updated.id,
        updated.orgId,
        userId,
        action,
        request.ownerApprovalStatus,
        request.ownerApprovalStatus,
        request.approvalRequiredReason ?? null,
      );

      return updated;
    });

    this.emitEvent(
      action === MaintenanceRequestOwnerApprovalAuditActionEnum.RESENT
        ? MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REMINDER
        : MAINTENANCE_REQUEST_EVENTS.OWNER_APPROVAL_REQUESTED,
      {
        request: this.toEventRequest(updated),
        actorUserId: userId,
      },
    );

    return this.withRequesterContext(updated);
  }

  private async hasGlobalPermission(
    userId: string,
    orgId: string,
    permission: string,
  ) {
    const effective =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
      });
    return effective.has(permission);
  }

  private async countUnreadCommentsForRequests(
    userId: string,
    orgId: string | undefined,
    requestIds: string[],
    scope: MaintenanceRequestCommentReadScope,
    visibility?: MaintenanceRequestCommentVisibility,
  ) {
    if (requestIds.length === 0) {
      return 0;
    }

    const [readStates, comments] = await Promise.all([
      this.requestsRepo.listCommentReadStates(userId, requestIds, scope),
      this.requestsRepo.listCommentTimestamps(
        orgId,
        requestIds,
        userId,
        visibility,
      ),
    ]);

    const lastReadAtByRequestId = new Map(
      readStates.map((state) => [state.requestId, state.lastReadAt]),
    );

    return comments.reduce((count, comment) => {
      const lastReadAt = lastReadAtByRequestId.get(comment.requestId);
      if (!lastReadAt || comment.createdAt > lastReadAt) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  private async getProviderAccessContext(userId: string) {
    const accessContext =
      await this.providerAccessService.getAccessibleProviderContext(userId);

    return {
      providerIds: accessContext.providerIds,
      managerProviderIds: new Set(Array.from(accessContext.adminProviderIds)),
    };
  }

  private assertProviderRequestWriteAccess(
    userId: string,
    accessContext: {
      managerProviderIds: Set<string>;
    },
    request: {
      serviceProviderId?: string | null;
      serviceProviderAssignedUserId?: string | null;
    },
  ) {
    const providerId = request.serviceProviderId;
    if (!providerId) {
      throw new ForbiddenException('Forbidden');
    }

    if (accessContext.managerProviderIds.has(providerId)) {
      return;
    }

    if (request.serviceProviderAssignedUserId !== userId) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getBuildingAccessContext(
    userId: string,
    orgId: string,
    buildingId: string,
  ) {
    const [{ assignments }, effectivePermissions] = await Promise.all([
      this.accessControlService.getUserScopedAssignments(userId, {
        orgId,
        buildingId,
      }),
      this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
        buildingId,
      }),
    ]);
    const hasAnyBuildingAccess = assignments.some(
      (assignment) => assignment.scopeType === 'BUILDING',
    );
    const hasElevatedBuildingAccess = effectivePermissions.has(
      REQUEST_ASSIGN_PERMISSION,
    );

    return {
      hasAnyBuildingAccess,
      isBuildingStaffOnly: hasAnyBuildingAccess && !hasElevatedBuildingAccess,
    };
  }

  private async assertOverridePermission(
    userId: string,
    orgId: string,
    buildingId: string,
  ) {
    const effectivePermissions =
      await this.accessControlService.getUserEffectivePermissions(userId, {
        orgId,
        buildingId,
      });
    if (!effectivePermissions.has(REQUEST_OWNER_APPROVAL_OVERRIDE_PERMISSION)) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private assertExecutionUnlocked(request: {
    title?: string | null;
    description?: string | null;
    type?: string | null;
    priority?: string | null;
    ownerApprovalStatus?: string | null;
    estimateStatus?: string | null;
    estimatedAmount?: Prisma.Decimal | null;
    isEmergency?: boolean | null;
    isLikeForLike?: boolean | null;
    isUpgrade?: boolean | null;
    isMajorReplacement?: boolean | null;
    isResponsibilityDisputed?: boolean | null;
  }) {
    const approvalStatus =
      request.ownerApprovalStatus ??
      MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED;
    if (
      OWNER_APPROVAL_BLOCKING_STATUSES.has(
        approvalStatus as MaintenanceRequestOwnerApprovalStatusEnum,
      )
    ) {
      throw new ConflictException('Request is blocked pending owner approval');
    }

    if (
      (request.estimateStatus ??
        MaintenanceRequestEstimateStatusEnum.NOT_REQUESTED) ===
      MaintenanceRequestEstimateStatusEnum.REQUESTED
    ) {
      throw new ConflictException(
        'Request is blocked pending estimate submission',
      );
    }

    const route = getMaintenanceRequestPolicyRoute(request);
    if (route === MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED) {
      throw new ConflictException(
        'Request requires owner approval before execution',
      );
    }
  }

  private assertRequestOpenForApproval(request: { status?: string | null }) {
    if (
      request.status === MaintenanceRequestStatusEnum.COMPLETED ||
      request.status === MaintenanceRequestStatusEnum.CANCELED
    ) {
      throw new ConflictException('Request is closed');
    }
  }

  private ensureRequestPolicyPayload(dto: UpdateRequestPolicyDto) {
    if (
      dto.estimatedAmount === undefined &&
      dto.estimatedCurrency === undefined &&
      dto.isEmergency === undefined &&
      dto.isLikeForLike === undefined &&
      dto.isUpgrade === undefined &&
      dto.isMajorReplacement === undefined &&
      dto.isResponsibilityDisputed === undefined
    ) {
      throw new BadRequestException('No policy triage changes provided');
    }
  }

  private buildPolicyTriageUpdateData(
    dto: UpdateRequestPolicyDto,
    request: {
      estimatedAmount?: Prisma.Decimal | null;
      estimatedCurrency?: string | null;
      isEmergency?: boolean | null;
      isLikeForLike?: boolean | null;
      isUpgrade?: boolean | null;
      isMajorReplacement?: boolean | null;
      isResponsibilityDisputed?: boolean | null;
    },
    options?: {
      defaultEstimatedCurrency?: string;
    },
  ): Prisma.MaintenanceRequestUpdateInput {
    const nextEstimatedCurrency =
      dto.estimatedCurrency !== undefined
        ? dto.estimatedCurrency.trim().toUpperCase()
        : dto.estimatedAmount !== undefined
          ? (request.estimatedCurrency ??
            options?.defaultEstimatedCurrency ??
            null)
          : request.estimatedCurrency;

    return {
      estimatedAmount:
        dto.estimatedAmount !== undefined
          ? new Prisma.Decimal(dto.estimatedAmount)
          : request.estimatedAmount,
      estimatedCurrency: nextEstimatedCurrency,
      isEmergency:
        dto.isEmergency !== undefined
          ? dto.isEmergency
          : (request.isEmergency ?? false),
      isLikeForLike:
        dto.isLikeForLike !== undefined
          ? dto.isLikeForLike
          : (request.isLikeForLike ?? null),
      isUpgrade:
        dto.isUpgrade !== undefined
          ? dto.isUpgrade
          : (request.isUpgrade ?? null),
      isMajorReplacement:
        dto.isMajorReplacement !== undefined
          ? dto.isMajorReplacement
          : (request.isMajorReplacement ?? null),
      isResponsibilityDisputed:
        dto.isResponsibilityDisputed !== undefined
          ? dto.isResponsibilityDisputed
          : (request.isResponsibilityDisputed ?? null),
    };
  }

  private toPolicySnapshotFromUpdate(
    request: {
      title?: string | null;
      description?: string | null;
      type?: string | null;
      priority?: string | null;
      ownerApprovalStatus?: string | null;
      estimateStatus?: string | null;
      estimatedAmount?: Prisma.Decimal | null;
      estimatedCurrency?: string | null;
      isEmergency?: boolean | null;
      isLikeForLike?: boolean | null;
      isUpgrade?: boolean | null;
      isMajorReplacement?: boolean | null;
      isResponsibilityDisputed?: boolean | null;
    },
    update: Prisma.MaintenanceRequestUpdateInput,
  ) {
    return {
      title: request.title ?? null,
      description: request.description ?? null,
      type: request.type ?? null,
      priority: request.priority ?? null,
      ownerApprovalStatus: request.ownerApprovalStatus ?? null,
      estimateStatus: request.estimateStatus ?? null,
      estimatedAmount:
        update.estimatedAmount !== undefined
          ? ((update.estimatedAmount as Prisma.Decimal | null) ?? null)
          : (request.estimatedAmount ?? null),
      estimatedCurrency:
        update.estimatedCurrency !== undefined
          ? ((update.estimatedCurrency as string | null) ?? null)
          : (request.estimatedCurrency ?? null),
      isEmergency:
        update.isEmergency !== undefined
          ? ((update.isEmergency as boolean | null) ?? null)
          : (request.isEmergency ?? false),
      isLikeForLike:
        update.isLikeForLike !== undefined
          ? ((update.isLikeForLike as boolean | null) ?? null)
          : (request.isLikeForLike ?? null),
      isUpgrade:
        update.isUpgrade !== undefined
          ? ((update.isUpgrade as boolean | null) ?? null)
          : (request.isUpgrade ?? null),
      isMajorReplacement:
        update.isMajorReplacement !== undefined
          ? ((update.isMajorReplacement as boolean | null) ?? null)
          : (request.isMajorReplacement ?? null),
      isResponsibilityDisputed:
        update.isResponsibilityDisputed !== undefined
          ? ((update.isResponsibilityDisputed as boolean | null) ?? null)
          : (request.isResponsibilityDisputed ?? null),
    };
  }

  private buildAutomaticApprovalReason(dto: {
    estimatedAmount?: number;
    isUpgrade?: boolean;
    isMajorReplacement?: boolean;
    isResponsibilityDisputed?: boolean;
    isLikeForLike?: boolean;
  }) {
    if (dto.isUpgrade) {
      return 'Estimate indicates upgrade or alteration requiring owner approval';
    }
    if (dto.isMajorReplacement) {
      return 'Estimate indicates major replacement requiring owner approval';
    }
    if (dto.isResponsibilityDisputed) {
      return 'Estimate indicates disputed responsibility requiring owner approval';
    }
    if (dto.isLikeForLike === false) {
      return 'Estimate indicates non-like-for-like work requiring owner approval';
    }
    if (
      dto.estimatedAmount !== undefined &&
      Number.isFinite(dto.estimatedAmount) &&
      dto.estimatedAmount > 1000
    ) {
      return 'Estimate exceeds owner approval threshold';
    }

    return 'Estimate requires owner approval before execution';
  }

  private buildEstimateDueAt(now = new Date()) {
    return new Date(
      now.getTime() +
        env.MAINTENANCE_ESTIMATE_DEFAULT_TTL_HOURS * 60 * 60 * 1000,
    );
  }

  private async submitRequestEstimateInTx(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      orgId: string;
      unitId?: string | null;
      status?: string | null;
      title?: string | null;
      description?: string | null;
      type?: string | null;
      priority?: string | null;
      ownerApprovalStatus?: string | null;
      estimateStatus?: string | null;
      estimateRequestedAt?: Date | null;
      estimateRequestedByUserId?: string | null;
      estimateSubmittedAt?: Date | null;
      estimateSubmittedByUserId?: string | null;
      ownerApprovalRequestedAt?: Date | null;
      ownerApprovalRequestedByUserId?: string | null;
      ownerApprovalDeadlineAt?: Date | null;
      estimatedAmount?: Prisma.Decimal | null;
      estimatedCurrency?: string | null;
      isEmergency?: boolean | null;
      isLikeForLike?: boolean | null;
      isUpgrade?: boolean | null;
      isMajorReplacement?: boolean | null;
      isResponsibilityDisputed?: boolean | null;
    },
    actorUserId: string,
    dto: SubmitRequestEstimateDto,
  ) {
    this.assertRequestOpenForApproval(request);

    const triageUpdate = this.buildPolicyTriageUpdateData(dto, request, {
      defaultEstimatedCurrency: request.estimatedCurrency ?? 'AED',
    });
    const route = getMaintenanceRequestPolicyRoute({
      ...request,
      ...this.toPolicySnapshotFromUpdate(request, triageUpdate),
      ownerApprovalStatus:
        MaintenanceRequestOwnerApprovalStatusEnum.NOT_REQUIRED,
      estimateStatus: MaintenanceRequestEstimateStatusEnum.SUBMITTED,
    });

    if (
      route === MaintenanceRequestPolicyRouteEnum.OWNER_APPROVAL_REQUIRED &&
      request.unitId
    ) {
      const previousStatus = request.ownerApprovalStatus;
      const nextStatus = MaintenanceRequestOwnerApprovalStatus.PENDING;
      const requiredReason =
        dto.approvalRequiredReason?.trim() ||
        this.buildAutomaticApprovalReason(dto);
      const hadRequestedApproval =
        request.ownerApprovalStatus ===
          MaintenanceRequestOwnerApprovalStatusEnum.PENDING &&
        Boolean(request.ownerApprovalRequestedAt);

      const updated = await this.requestsRepo.updateById(
        request.id,
        {
          ...triageUpdate,
          estimateStatus: MaintenanceRequestEstimateStatusEnum.SUBMITTED,
          estimateSubmittedAt: new Date(),
          estimateSubmittedByUser: { connect: { id: actorUserId } },
          estimateReminderSentAt: null,
          ownerApprovalStatus: nextStatus,
          approvalRequiredReason: requiredReason,
          ownerApprovalRequestedAt: hadRequestedApproval
            ? request.ownerApprovalRequestedAt
            : new Date(),
          ownerApprovalRequestedByUser: hadRequestedApproval
            ? request.ownerApprovalRequestedByUserId
              ? { connect: { id: request.ownerApprovalRequestedByUserId } }
              : { connect: { id: actorUserId } }
            : { connect: { id: actorUserId } },
          ownerApprovalDeadlineAt: dto.ownerApprovalDeadlineAt
            ? new Date(dto.ownerApprovalDeadlineAt)
            : request.ownerApprovalDeadlineAt,
          ownerApprovalReason: null,
          ownerApprovalDecidedAt: null,
          ownerApprovalDecidedByOwnerUser: { disconnect: true },
          ownerApprovalDecisionSource: null,
          ownerApprovalOverrideReason: null,
          ownerApprovalOverriddenByUser: { disconnect: true },
        },
        tx,
      );

      if (
        previousStatus !== MaintenanceRequestOwnerApprovalStatusEnum.PENDING
      ) {
        await this.createOwnerApprovalAudit(
          tx,
          updated.id,
          updated.orgId,
          actorUserId,
          MaintenanceRequestOwnerApprovalAuditActionEnum.REQUIRED,
          previousStatus,
          nextStatus,
          requiredReason,
        );
      }

      if (!hadRequestedApproval) {
        await this.createOwnerApprovalAudit(
          tx,
          updated.id,
          updated.orgId,
          actorUserId,
          MaintenanceRequestOwnerApprovalAuditActionEnum.REQUESTED,
          nextStatus,
          nextStatus,
          requiredReason,
        );
      }

      return {
        updated,
        shouldEmitOwnerApprovalRequested: !hadRequestedApproval,
      };
    }

    const updated = await this.requestsRepo.updateById(
      request.id,
      {
        ...triageUpdate,
        estimateStatus: MaintenanceRequestEstimateStatusEnum.SUBMITTED,
        estimateSubmittedAt: new Date(),
        estimateSubmittedByUser: { connect: { id: actorUserId } },
        estimateReminderSentAt: null,
        ownerApprovalStatus: MaintenanceRequestOwnerApprovalStatus.NOT_REQUIRED,
        ownerApprovalRequestedAt: null,
        ownerApprovalRequestedByUser: { disconnect: true },
        ownerApprovalDeadlineAt: null,
        ownerApprovalReason: null,
        approvalRequiredReason: null,
        ownerApprovalDecidedAt: null,
        ownerApprovalDecidedByOwnerUser: { disconnect: true },
        ownerApprovalDecisionSource: null,
        ownerApprovalOverrideReason: null,
        ownerApprovalOverriddenByUser: { disconnect: true },
      },
      tx,
    );

    return {
      updated,
      shouldEmitOwnerApprovalRequested: false,
    };
  }

  private async createOwnerApprovalAudit(
    tx: Prisma.TransactionClient,
    requestId: string,
    orgId: string,
    actorUserId: string,
    action: MaintenanceRequestOwnerApprovalAuditActionEnum,
    fromStatus: string | null | undefined,
    toStatus: MaintenanceRequestOwnerApprovalStatus,
    reason?: string | null,
    decisionSource?: MaintenanceRequestOwnerApprovalDecisionSource | null,
  ) {
    await tx.maintenanceRequestOwnerApprovalAudit.create({
      data: {
        requestId,
        orgId,
        actorUserId,
        action,
        fromStatus:
          (fromStatus as
            | MaintenanceRequestOwnerApprovalStatus
            | null
            | undefined) ?? null,
        toStatus,
        decisionSource: decisionSource ?? null,
        reason: reason ?? null,
      },
    });
  }

  private assignmentHasPermissions(
    rolePermissions: Array<{ permission: { key: string } }>,
    permissionKeys: string[],
  ) {
    const assignedPermissionKeys = new Set(
      rolePermissions.map((rolePermission) => rolePermission.permission.key),
    );

    return permissionKeys.every((permissionKey) =>
      assignedPermissionKeys.has(permissionKey),
    );
  }

  private normalizePriority(
    value?: string,
  ): MaintenanceRequestPriority | undefined {
    if (!value) {
      return undefined;
    }
    switch (value) {
      case 'LOW':
        return MaintenanceRequestPriority.LOW;
      case 'MEDIUM':
        return MaintenanceRequestPriority.NORMAL;
      case 'HIGH':
        return MaintenanceRequestPriority.HIGH;
      default:
        return undefined;
    }
  }

  private normalizeType(value?: string): MaintenanceRequestType | undefined {
    if (!value) {
      return undefined;
    }
    switch (value) {
      case 'CLEANING':
        return MaintenanceRequestType.CLEANING;
      case 'ELECTRICAL':
        return MaintenanceRequestType.ELECTRICAL;
      case 'MAINTENANCE':
        return MaintenanceRequestType.MAINTENANCE;
      case 'PLUMBING_AC_HEATING':
        return MaintenanceRequestType.PLUMBING_AC_HEATING;
      case 'OTHER':
        return MaintenanceRequestType.OTHER;
      default:
        return undefined;
    }
  }

  private normalizeEmergencySignals(
    values?: string[],
  ): MaintenanceRequestEmergencySignalEnum[] {
    if (!values?.length) {
      return [];
    }

    const normalized = values
      .map((value) => {
        switch (value) {
          case 'ACTIVE_LEAK':
            return MaintenanceRequestEmergencySignalEnum.ACTIVE_LEAK;
          case 'NO_POWER':
            return MaintenanceRequestEmergencySignalEnum.NO_POWER;
          case 'SAFETY_RISK':
            return MaintenanceRequestEmergencySignalEnum.SAFETY_RISK;
          case 'NO_COOLING':
            return MaintenanceRequestEmergencySignalEnum.NO_COOLING;
          default:
            return null;
        }
      })
      .filter(
        (value): value is MaintenanceRequestEmergencySignalEnum =>
          value !== null,
      );

    return [...new Set(normalized)];
  }

  private async withRequesterContext<
    T extends {
      id: string;
      orgId: string;
      buildingId: string;
      createdByUserId: string;
      createdAt: Date;
      unitId?: string | null;
      occupancyIdAtCreation?: string | null;
      leaseIdAtCreation?: string | null;
    },
  >(request: T) {
    const [contextByRequestId, tenancyContextByRequestId] = await Promise.all([
      buildRequesterContextMap(this.prisma, [
        {
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdByUserId,
          unitId: request.unitId ?? null,
        },
      ]),
      buildRequestTenancyContextMap(this.prisma, [
        {
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdByUserId,
          createdAt: request.createdAt,
          buildingId: request.buildingId,
          unitId: request.unitId ?? null,
          occupancyIdAtCreation: request.occupancyIdAtCreation ?? null,
          leaseIdAtCreation: request.leaseIdAtCreation ?? null,
        },
      ]),
    ]);

    return {
      ...request,
      requesterContext: getRequesterContextOrDefault(
        contextByRequestId,
        request.id,
      ),
      requestTenancyContext: getRequestTenancyContextOrDefault(
        tenancyContextByRequestId,
        request.id,
      ),
    };
  }

  private async withRequesterContextList<
    T extends {
      id: string;
      orgId: string;
      buildingId: string;
      createdByUserId: string;
      createdAt: Date;
      unitId?: string | null;
      occupancyIdAtCreation?: string | null;
      leaseIdAtCreation?: string | null;
    },
  >(requests: T[]) {
    if (requests.length === 0) {
      return [];
    }

    const [contextByRequestId, tenancyContextByRequestId] = await Promise.all([
      buildRequesterContextMap(
        this.prisma,
        requests.map((request) => ({
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdByUserId,
          unitId: request.unitId ?? null,
        })),
      ),
      buildRequestTenancyContextMap(
        this.prisma,
        requests.map((request) => ({
          requestId: request.id,
          orgId: request.orgId,
          requesterUserId: request.createdByUserId,
          createdAt: request.createdAt,
          buildingId: request.buildingId,
          unitId: request.unitId ?? null,
          occupancyIdAtCreation: request.occupancyIdAtCreation ?? null,
          leaseIdAtCreation: request.leaseIdAtCreation ?? null,
        })),
      ),
    ]);

    return requests.map((request) => ({
      ...request,
      requesterContext: getRequesterContextOrDefault(
        contextByRequestId,
        request.id,
      ),
      requestTenancyContext: getRequestTenancyContextOrDefault(
        tenancyContextByRequestId,
        request.id,
      ),
    }));
  }

  private toEventRequest(request: {
    id: string;
    orgId: string;
    buildingId: string;
    unitId?: string | null;
    title: string;
    status?: string | null;
    ownerApprovalStatus?: string | null;
    createdByUserId: string;
    assignedToUserId?: string | null;
    serviceProviderId?: string | null;
    serviceProviderAssignedUserId?: string | null;
    isEmergency?: boolean | null;
    emergencySignals?: string[] | null;
    unit?: { id: string; label: string } | null;
  }): MaintenanceRequestSnapshot {
    return {
      id: request.id,
      orgId: request.orgId,
      buildingId: request.buildingId,
      unitId: request.unitId ?? null,
      title: request.title,
      status: request.status ?? null,
      ownerApprovalStatus: request.ownerApprovalStatus ?? null,
      createdByUserId: request.createdByUserId,
      assignedToUserId: request.assignedToUserId ?? null,
      serviceProviderId: request.serviceProviderId ?? null,
      serviceProviderAssignedUserId:
        request.serviceProviderAssignedUserId ?? null,
      isEmergency: request.isEmergency ?? false,
      emergencySignals: request.emergencySignals ?? [],
      unit: request.unit
        ? { id: request.unit.id, label: request.unit.label }
        : null,
    };
  }

  private emitEvent(event: string, payload: MaintenanceRequestEventPayload) {
    this.eventEmitter.emit(event, payload);
  }

  private async requireActiveResidentOccupancy(
    userId: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const occupancy = await this.requestsRepo.findAssignedActiveOccupancy(
      userId,
      orgId,
      tx,
    );
    if (!occupancy) {
      throw new ForbiddenException('Active occupancy required');
    }

    return occupancy;
  }
}
