import { Injectable } from '@nestjs/common';
import {
  OwnerAccessGrantStatus,
  ServiceProviderUserRole,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MaintenanceRequestSnapshot } from '../maintenance-requests/maintenance-requests.events';

@Injectable()
export class NotificationRecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForRequestCreated(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients = await this.resolveOpsRecipients(
      request.orgId,
      request.buildingId,
    );
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForRequestAssigned(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
    previousRequest?: MaintenanceRequestSnapshot,
  ) {
    const recipients = new Set<string>();

    if (request.serviceProviderAssignedUserId) {
      recipients.add(request.serviceProviderAssignedUserId);
    } else if (request.serviceProviderId) {
      const providerRecipients = await this.getActiveProviderManagers(
        request.serviceProviderId,
      );
      providerRecipients.forEach((id) => recipients.add(id));
    } else {
      if (request.assignedToUserId) {
        recipients.add(request.assignedToUserId);
      }
      recipients.add(request.createdByUserId);

      const opsRecipients = await this.resolveOpsRecipients(
        request.orgId,
        request.buildingId,
      );
      opsRecipients.forEach((id) => recipients.add(id));
    }

    if (request.isEmergency) {
      const ownerRecipients =
        await this.resolveActiveOwnerRecipientsForRequest(request);
      ownerRecipients.forEach((id) => recipients.add(id));
    }

    await this.addPreviousExecutionRecipients(
      recipients,
      request,
      previousRequest,
    );

    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForRequestStatusChanged(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
    previousRequest?: MaintenanceRequestSnapshot,
  ) {
    const recipients = new Set<string>([request.createdByUserId]);
    if (request.assignedToUserId) {
      recipients.add(request.assignedToUserId);
    }

    const opsRecipients = await this.resolveOpsRecipients(
      request.orgId,
      request.buildingId,
    );
    opsRecipients.forEach((id) => recipients.add(id));

    await this.addPreviousExecutionRecipients(
      recipients,
      request,
      previousRequest,
    );
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForRequestCommented(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
    _actorIsResident: boolean,
  ) {
    void _actorIsResident;
    const recipients = new Set<string>([request.createdByUserId]);
    if (request.assignedToUserId) {
      recipients.add(request.assignedToUserId);
    }

    const opsRecipients = await this.resolveOpsRecipients(
      request.orgId,
      request.buildingId,
    );
    opsRecipients.forEach((id) => recipients.add(id));

    const ownerRecipients =
      await this.resolveActiveOwnerRecipientsForRequest(request);
    ownerRecipients.forEach((id) => recipients.add(id));

    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForRequestCanceled(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients = await this.resolveOpsRecipients(
      request.orgId,
      request.buildingId,
    );
    if (request.assignedToUserId) {
      recipients.add(request.assignedToUserId);
    }
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForEstimateReminder(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients = await this.resolveOpsRecipients(
      request.orgId,
      request.buildingId,
    );
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForOwnerApprovalRequested(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients =
      await this.resolveActiveOwnerRecipientsForRequest(request);
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForOwnerApprovalReminder(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients =
      await this.resolveActiveOwnerRecipientsForRequest(request);
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForOwnerRequestApproved(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients = await this.resolveExecutionRecipients(request);
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForOwnerRequestRejected(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients = await this.resolveExecutionRecipients(request);
    return this.finalizeRecipients(recipients, actorUserId);
  }

  async resolveForOwnerRequestOverridden(
    request: MaintenanceRequestSnapshot,
    actorUserId: string,
  ) {
    const recipients = await this.resolveExecutionRecipients(request);
    const ownerRecipients =
      await this.resolveActiveOwnerRecipientsForRequest(request);
    ownerRecipients.forEach((id) => recipients.add(id));
    return this.finalizeRecipients(recipients, actorUserId);
  }

  private async resolveExecutionRecipients(
    request: MaintenanceRequestSnapshot,
  ) {
    const recipients = new Set<string>([request.createdByUserId]);
    if (request.assignedToUserId) {
      recipients.add(request.assignedToUserId);
    }
    if (request.serviceProviderAssignedUserId) {
      recipients.add(request.serviceProviderAssignedUserId);
    } else if (request.serviceProviderId) {
      const providerManagers = await this.getActiveProviderManagers(
        request.serviceProviderId,
      );
      providerManagers.forEach((id) => recipients.add(id));
    }

    const opsRecipients = await this.resolveOpsRecipients(
      request.orgId,
      request.buildingId,
    );
    opsRecipients.forEach((id) => recipients.add(id));
    return recipients;
  }

  private async addPreviousExecutionRecipients(
    recipients: Set<string>,
    request: MaintenanceRequestSnapshot,
    previousRequest?: MaintenanceRequestSnapshot,
  ) {
    if (!previousRequest) {
      return;
    }

    if (
      previousRequest.assignedToUserId &&
      previousRequest.assignedToUserId !== request.assignedToUserId
    ) {
      recipients.add(previousRequest.assignedToUserId);
    }

    if (
      previousRequest.serviceProviderAssignedUserId &&
      previousRequest.serviceProviderAssignedUserId !==
        request.serviceProviderAssignedUserId
    ) {
      recipients.add(previousRequest.serviceProviderAssignedUserId);
    }

    if (
      previousRequest.serviceProviderId &&
      previousRequest.serviceProviderId !== request.serviceProviderId
    ) {
      await this.addPreviousProviderManagerRecipients(
        recipients,
        previousRequest.serviceProviderId,
      );
    }
  }

  private async addPreviousProviderManagerRecipients(
    recipients: Set<string>,
    previousServiceProviderId: string,
  ) {
    const providerManagers = await this.getActiveProviderManagers(
      previousServiceProviderId,
    );
    providerManagers.forEach((id) => recipients.add(id));
  }

  private async resolveOpsRecipients(orgId: string, buildingId: string) {
    let recipients = await this.getBuildingManagersAndAdmins(orgId, buildingId);

    if (recipients.size === 0) {
      recipients = await this.getOrgAdmins(orgId);
      // TODO: Expand recipient resolution once more org-level roles are defined.
    }

    return recipients;
  }

  private async getBuildingManagersAndAdmins(
    orgId: string,
    buildingId: string,
  ) {
    const assignments = await this.prisma.userAccessAssignment.findMany({
      where: {
        scopeType: 'BUILDING',
        scopeId: buildingId,
        roleTemplate: {
          orgId,
          scopeType: 'BUILDING',
          key: { in: ['building_manager', 'building_admin'] },
        },
      },
      include: { user: true },
    });

    const recipients = new Set<string>();
    for (const assignment of assignments) {
      const user = assignment.user;
      if (user && user.isActive && user.orgId === orgId) {
        recipients.add(assignment.userId);
      }
    }
    return recipients;
  }

  private async getOrgAdmins(orgId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        accessAssignments: {
          some: {
            scopeType: 'ORG',
            scopeId: null,
            roleTemplate: { key: { in: ['org_admin'] }, orgId },
          },
        },
      },
    });
    return new Set(users.map((user) => user.id));
  }

  private async getActiveProviderManagers(serviceProviderId: string) {
    const memberships = await this.prisma.serviceProviderUser.findMany({
      where: {
        serviceProviderId,
        role: ServiceProviderUserRole.ADMIN,
        isActive: true,
        user: {
          isActive: true,
        },
        serviceProvider: {
          isActive: true,
        },
      },
      include: {
        user: true,
      },
    });

    const recipients = new Set<string>();
    for (const membership of memberships) {
      if (membership.user && membership.user.isActive) {
        recipients.add(membership.userId);
      }
    }

    return recipients;
  }

  private async resolveActiveOwnerRecipientsForRequest(
    request: MaintenanceRequestSnapshot,
  ) {
    if (!request.unitId) {
      return new Set<string>();
    }

    const prisma = this.prisma as PrismaService & {
      ownerAccessGrant?: {
        findMany?: (args: unknown) => Promise<Array<{ userId: string | null }>>;
      };
      unitOwnership?: {
        findMany?: (args: unknown) => Promise<Array<{ ownerId: string }>>;
      };
      unit?: {
        findFirst?: (
          args: unknown,
        ) => Promise<{ ownerId: string | null } | null>;
      };
    };

    if (
      !prisma.ownerAccessGrant?.findMany ||
      !prisma.unitOwnership?.findMany ||
      !prisma.unit?.findFirst
    ) {
      return new Set<string>();
    }

    const activeOwnerships = await prisma.unitOwnership.findMany({
      where: {
        orgId: request.orgId,
        unitId: request.unitId,
        endDate: null,
        owner: {
          isActive: true,
        },
      },
      select: {
        ownerId: true,
      },
    });

    const ownerIds = new Set(activeOwnerships.map((row) => row.ownerId));

    if (ownerIds.size === 0) {
      const fallbackUnit = await prisma.unit.findFirst({
        where: {
          id: request.unitId,
          building: {
            orgId: request.orgId,
          },
          ownerships: {
            none: {
              endDate: null,
            },
          },
          owner: {
            isActive: true,
          },
        },
        select: {
          ownerId: true,
        },
      });

      if (fallbackUnit?.ownerId) {
        ownerIds.add(fallbackUnit.ownerId);
      }
    }

    if (ownerIds.size === 0) {
      return new Set<string>();
    }

    const grants = await prisma.ownerAccessGrant.findMany({
      where: {
        ownerId: {
          in: Array.from(ownerIds),
        },
        status: OwnerAccessGrantStatus.ACTIVE,
        userId: {
          not: null,
        },
        owner: {
          isActive: true,
        },
      },
      select: {
        userId: true,
      },
    });

    const recipients = new Set<string>();
    for (const grant of grants) {
      if (grant.userId) {
        recipients.add(grant.userId);
      }
    }

    return recipients;
  }

  private finalizeRecipients(recipients: Set<string>, actorUserId: string) {
    recipients.delete(actorUserId);
    if (recipients.size === 0) {
      recipients.add(actorUserId);
    }
    return recipients;
  }
}
