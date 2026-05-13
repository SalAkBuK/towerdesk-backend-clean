import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import * as argon2 from 'argon2';
import {
  PLATFORM_ROLE_TEMPLATE_DEFINITIONS,
  PLATFORM_ROLE_TEMPLATE_PERMISSION_MAP,
  ROLE_TEMPLATE_PERMISSION_MAP,
  SYSTEM_ROLE_TEMPLATE_DEFINITIONS,
} from '../src/modules/access-control/role-defaults';
import { buildUserAccessAssignmentId } from '../src/modules/access-control/access-assignment-id.util';

config();

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';
const allowProduction = process.argv.includes('--allow-production');
if (isProduction && !allowProduction) {
  throw new Error(
    'Refusing to run seed in production without --allow-production',
  );
}

const permissions = [
  { key: 'users.read', name: 'Read users', description: 'View user records' },
  {
    key: 'users.write',
    name: 'Manage users',
    description: 'Create/update users',
  },
  {
    key: 'roles.read',
    name: 'Read roles',
    description: 'View roles and permissions',
  },
  {
    key: 'roles.write',
    name: 'Manage roles',
    description: 'Create/update roles',
  },
  {
    key: 'dashboard.read',
    name: 'Read dashboard',
    description: 'View org dashboard analytics',
  },
  {
    key: 'buildings.read',
    name: 'Read buildings',
    description: 'View buildings in the org',
  },
  {
    key: 'buildings.write',
    name: 'Manage buildings',
    description: 'Create/update buildings in the org',
  },
  {
    key: 'buildings.delete',
    name: 'Delete buildings',
    description: 'Delete buildings in the org',
  },
  {
    key: 'units.read',
    name: 'Read units',
    description: 'View units in a building',
  },
  {
    key: 'units.write',
    name: 'Manage units',
    description: 'Create/update units in a building',
  },
  {
    key: 'unitTypes.read',
    name: 'Read unit types',
    description: 'View unit types in the org',
  },
  {
    key: 'unitTypes.write',
    name: 'Manage unit types',
    description: 'Create/update unit types in the org',
  },
  {
    key: 'owners.read',
    name: 'Read owners',
    description: 'View owners in the org',
  },
  {
    key: 'owners.write',
    name: 'Manage owners',
    description: 'Create/update owners in the org',
  },
  {
    key: 'owner_registry.resolve',
    name: 'Resolve owner registry',
    description: 'Resolve global owner identity matches by strong identifier',
  },
  {
    key: 'owner_access_grants.read',
    name: 'Read owner access grants',
    description: 'View owner access grants in the org',
  },
  {
    key: 'owner_access_grants.write',
    name: 'Manage owner access grants',
    description: 'Create/update/disable owner access grants in the org',
  },
  {
    key: 'service_providers.read',
    name: 'Read service providers',
    description: 'View service providers and their linked buildings and users',
  },
  {
    key: 'service_providers.write',
    name: 'Manage service providers',
    description:
      'Create/update service providers, link them to buildings, and manage provider admin onboarding',
  },
  {
    key: 'building.assignments.read',
    name: 'Read building assignments',
    description: 'View building assignments',
  },
  {
    key: 'building.assignments.write',
    name: 'Manage building assignments',
    description: 'Create building assignments',
  },
  {
    key: 'occupancy.read',
    name: 'Read occupancies',
    description: 'View active occupancies',
  },
  {
    key: 'occupancy.write',
    name: 'Manage occupancies',
    description: 'Create occupancies',
  },
  {
    key: 'leases.read',
    name: 'Read leases',
    description: 'View lease records',
  },
  {
    key: 'leases.write',
    name: 'Manage leases',
    description: 'Create/update lease records',
  },
  {
    key: 'leases.documents.read',
    name: 'Read lease documents',
    description: 'View lease document attachments',
  },
  {
    key: 'leases.documents.write',
    name: 'Manage lease documents',
    description: 'Create/delete lease document attachments',
  },
  {
    key: 'leases.access_items.read',
    name: 'Read lease access items',
    description: 'View lease access cards and parking stickers',
  },
  {
    key: 'leases.access_items.write',
    name: 'Manage lease access items',
    description: 'Create/update/delete lease access cards and parking stickers',
  },
  {
    key: 'leases.occupants.read',
    name: 'Read lease occupants',
    description: 'View normalized lease occupants',
  },
  {
    key: 'leases.occupants.write',
    name: 'Manage lease occupants',
    description: 'Replace lease occupant list',
  },
  {
    key: 'leases.move_in',
    name: 'Move in',
    description: 'Perform lease move-in flow',
  },
  {
    key: 'leases.move_out',
    name: 'Move out',
    description: 'Perform lease move-out flow',
  },
  {
    key: 'contracts.read',
    name: 'Read contracts',
    description: 'View contract records',
  },
  {
    key: 'contracts.write',
    name: 'Manage contracts',
    description: 'Create/update contract records',
  },
  {
    key: 'contracts.documents.read',
    name: 'Read contract documents',
    description: 'View contract document attachments',
  },
  {
    key: 'contracts.documents.write',
    name: 'Manage contract documents',
    description: 'Create/delete contract document attachments',
  },
  {
    key: 'contracts.occupants.read',
    name: 'Read contract occupants',
    description: 'View normalized contract occupants',
  },
  {
    key: 'contracts.occupants.write',
    name: 'Manage contract occupants',
    description: 'Replace contract occupant list',
  },
  {
    key: 'contracts.move_in_request.create',
    name: 'Create move-in requests',
    description: 'Create tenant move-in requests for contracts',
  },
  {
    key: 'contracts.move_out_request.create',
    name: 'Create move-out requests',
    description: 'Create tenant move-out requests for contracts',
  },
  {
    key: 'contracts.move_requests.review',
    name: 'Review move requests',
    description: 'Approve/reject move-in and move-out requests',
  },
  {
    key: 'contracts.move_in.execute',
    name: 'Execute move in',
    description: 'Execute approved move-in requests',
  },
  {
    key: 'contracts.move_out.execute',
    name: 'Execute move out',
    description: 'Execute approved move-out requests',
  },
  {
    key: 'residents.read',
    name: 'Read residents',
    description: 'View building residents',
  },
  {
    key: 'residents.write',
    name: 'Manage residents',
    description: 'Onboard residents and assign units',
  },
  {
    key: 'residents.profile.read',
    name: 'Read resident profiles',
    description: 'View resident personal profiles',
  },
  {
    key: 'residents.profile.write',
    name: 'Manage resident profiles',
    description: 'Create/update resident personal profiles',
  },
  {
    key: 'requests.read',
    name: 'Read maintenance requests',
    description: 'View maintenance requests',
  },
  {
    key: 'requests.write',
    name: 'Manage maintenance requests',
    description: 'Edit maintenance requests',
  },
  {
    key: 'requests.assign',
    name: 'Assign maintenance requests',
    description: 'Assign requests to staff',
  },
  {
    key: 'requests.update_status',
    name: 'Update maintenance status',
    description: 'Move requests through workflow',
  },
  {
    key: 'requests.comment',
    name: 'Comment on maintenance requests',
    description: 'Post comments on requests',
  },
  {
    key: 'requests.owner_approval_override',
    name: 'Override owner approvals',
    description:
      'Override pending owner approvals for urgent or emergency maintenance',
  },
  {
    key: 'visitors.create',
    name: 'Create visitors',
    description: 'Log visitors for building units',
  },
  {
    key: 'visitors.read',
    name: 'Read visitors',
    description: 'View visitors in buildings',
  },
  {
    key: 'visitors.update',
    name: 'Update visitors',
    description: 'Update visitor details and status',
  },
  {
    key: 'broadcasts.read',
    name: 'Read broadcasts',
    description: 'View org and building broadcasts',
  },
  {
    key: 'broadcasts.write',
    name: 'Manage broadcasts',
    description: 'Create broadcasts',
  },
  {
    key: 'messaging.read',
    name: 'Read messaging',
    description: 'View conversations and messages',
  },
  {
    key: 'messaging.write',
    name: 'Manage messaging',
    description: 'Create conversations and send messages',
  },
  {
    key: 'notifications.read',
    name: 'Read notifications',
    description: 'View notifications and unread counts',
  },
  {
    key: 'notifications.write',
    name: 'Manage notifications',
    description: 'Mark notifications read, dismiss, and manage push devices',
  },
  {
    key: 'resident.profile.read',
    name: 'Read own resident profile',
    description: 'View current resident profile and occupancy context',
  },
  {
    key: 'resident.profile.write',
    name: 'Manage own resident profile',
    description: 'Update current resident profile details',
  },
  {
    key: 'resident.requests.read',
    name: 'Read own resident requests',
    description: 'View resident maintenance requests and comments',
  },
  {
    key: 'resident.requests.create',
    name: 'Create resident requests',
    description: 'Create maintenance requests as a resident',
  },
  {
    key: 'resident.requests.update',
    name: 'Update own resident requests',
    description: 'Update resident maintenance requests while allowed',
  },
  {
    key: 'resident.requests.cancel',
    name: 'Cancel own resident requests',
    description: 'Cancel resident maintenance requests while allowed',
  },
  {
    key: 'resident.requests.comment',
    name: 'Comment on own resident requests',
    description: 'Read and post comments on resident maintenance requests',
  },
  {
    key: 'resident.visitors.read',
    name: 'Read own resident visitors',
    description: 'View resident visitor entries',
  },
  {
    key: 'resident.visitors.create',
    name: 'Create resident visitors',
    description: 'Create visitor entries as a resident',
  },
  {
    key: 'resident.visitors.update',
    name: 'Update own resident visitors',
    description: 'Update resident visitor entries',
  },
  {
    key: 'resident.visitors.cancel',
    name: 'Cancel own resident visitors',
    description: 'Cancel resident visitor entries',
  },
  {
    key: 'resident.contracts.read',
    name: 'Read own resident contracts',
    description: 'View resident contracts and active lease data',
  },
  {
    key: 'resident.contracts.documents.read',
    name: 'Read own resident contract documents',
    description: 'View resident contract documents',
  },
  {
    key: 'resident.contracts.documents.create',
    name: 'Create resident contract documents',
    description: 'Upload resident contract documents',
  },
  {
    key: 'resident.moves.read',
    name: 'Read own resident move requests',
    description: 'View resident move-in and move-out requests',
  },
  {
    key: 'resident.moves.create',
    name: 'Create resident move requests',
    description: 'Create resident move-in and move-out requests',
  },
  {
    key: 'org.profile.write',
    name: 'Manage org profile',
    description: 'Update org name and branding',
  },
  {
    key: 'platform.org.create',
    name: 'Create orgs',
    description: 'Create organizations via platform',
  },
  {
    key: 'platform.org.read',
    name: 'Read orgs',
    description: 'List organizations via platform',
  },
  {
    key: 'platform.org.admin.create',
    name: 'Create org admins',
    description: 'Create org admins via platform',
  },
  {
    key: 'platform.org.admin.read',
    name: 'Read org admins',
    description: 'List org admins via platform',
  },
  {
    key: 'platform.delivery_tasks.read',
    name: 'Read delivery tasks',
    description: 'Inspect async delivery task state across the platform',
  },
  {
    key: 'platform.delivery_tasks.retry',
    name: 'Retry delivery tasks',
    description: 'Retry failed async delivery tasks via platform operations',
  },
  {
    key: 'platform.delivery_tasks.cleanup',
    name: 'Clean up delivery tasks',
    description: 'Delete expired terminal delivery tasks via platform operations',
  },
  {
    key: 'parkingSlots.create',
    name: 'Create parking slots',
    description: 'Create parking slots in buildings',
  },
  {
    key: 'parkingSlots.read',
    name: 'Read parking slots',
    description: 'View parking slots in buildings',
  },
  {
    key: 'parkingSlots.update',
    name: 'Update parking slots',
    description: 'Update parking slot details',
  },
  {
    key: 'parkingAllocations.create',
    name: 'Create parking allocations',
    description: 'Allocate parking slots to occupancies',
  },
  {
    key: 'parkingAllocations.read',
    name: 'Read parking allocations',
    description: 'View parking allocations',
  },
  {
    key: 'parkingAllocations.end',
    name: 'End parking allocations',
    description: 'End parking allocations',
  },
  {
    key: 'vehicles.create',
    name: 'Create vehicles',
    description: 'Register vehicles for occupancies',
  },
  {
    key: 'vehicles.read',
    name: 'Read vehicles',
    description: 'View vehicles for occupancies',
  },
  {
    key: 'vehicles.update',
    name: 'Update vehicles',
    description: 'Update vehicle details',
  },
  {
    key: 'vehicles.delete',
    name: 'Delete vehicles',
    description: 'Delete vehicles',
  },
];

async function seedPermissions() {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        name: permission.name,
        description: permission.description,
      },
      create: permission,
    });
  }
}

async function seedRolePermissions(
  roleRecords: { id: string; key: string }[],
  rolePermissionMap: Record<string, string[]>,
) {
  const permissionRecords = await prisma.permission.findMany({
    where: { key: { in: permissions.map((permission) => permission.key) } },
  });

  const permissionByKey = new Map(
    permissionRecords.map((permission) => [permission.key, permission.id]),
  );
  const roleByKey = new Map(roleRecords.map((role) => [role.key, role.id]));

  const data = Object.entries(rolePermissionMap).flatMap(([roleKey, keys]) => {
    const roleId = roleByKey.get(roleKey);
    if (!roleId) {
      return [];
    }
    return keys
      .map((key) => permissionByKey.get(key))
      .filter((permissionId): permissionId is string => Boolean(permissionId))
      .map((permissionId) => ({
        roleTemplateId: roleId,
        permissionId,
      }));
  });

  if (data.length > 0) {
    await prisma.roleTemplatePermission.createMany({
      data,
      skipDuplicates: true,
    });
  }
}

async function seedOrg() {
  const existing = await prisma.org.findFirst({
    where: { name: 'Towerdesk Demo Org' },
  });
  if (existing) {
    return existing;
  }

  return prisma.org.create({ data: { name: 'Towerdesk Demo Org' } });
}

async function seedUnitTypes(orgId: string) {
  const defaults = ['Apartment', 'Shop', 'Office', 'Other'];
  for (const name of defaults) {
    await prisma.unitType.upsert({
      where: { orgId_name: { orgId, name } },
      update: { isActive: true },
      create: { orgId, name, isActive: true },
    });
  }
}

async function seedOrgAdmin(orgId: string) {
  const passwordHash = await argon2.hash('Admin123!');
  const user = await prisma.user.upsert({
    where: { email: 'admin@towerdesk.local' },
    update: {
      name: 'Org Admin',
      orgId,
      isActive: true,
    },
    create: {
      email: 'admin@towerdesk.local',
      name: 'Org Admin',
      passwordHash,
      orgId,
    },
  });

  const adminRole = await prisma.roleTemplate.findFirst({
    where: { key: 'org_admin', orgId },
  });
  if (adminRole) {
    await prisma.userAccessAssignment.createMany({
      data: [
        {
          id: buildUserAccessAssignmentId({
            userId: user.id,
            roleTemplateId: adminRole.id,
            scopeType: 'ORG',
            scopeId: null,
          }),
          userId: user.id,
          roleTemplateId: adminRole.id,
          scopeType: 'ORG',
          scopeId: null,
        },
      ],
      skipDuplicates: true,
    });
  }

  return user;
}

async function seedPlatformSuperadmin() {
  const email =
    process.env.PLATFORM_SUPERADMIN_EMAIL ?? 'platform-admin@towerdesk.local';
  const password = process.env.PLATFORM_SUPERADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Platform Superadmin',
      orgId: null,
      isActive: true,
    },
    create: {
      email,
      name: 'Platform Superadmin',
      passwordHash,
      orgId: null,
      mustChangePassword: true,
    },
  });

  const role = await prisma.roleTemplate.findFirst({
    where: { orgId: null, key: 'platform_superadmin' },
  });
  if (role) {
    await prisma.userAccessAssignment.createMany({
      data: [
        {
          id: buildUserAccessAssignmentId({
            userId: user.id,
            roleTemplateId: role.id,
            scopeType: 'ORG',
            scopeId: null,
          }),
          userId: user.id,
          roleTemplateId: role.id,
          scopeType: 'ORG',
          scopeId: null,
        },
      ],
      skipDuplicates: true,
    });
  }

  return user;
}

async function seedOrgRoles(orgId: string) {
  const roleRecords = [];
  for (const role of SYSTEM_ROLE_TEMPLATE_DEFINITIONS) {
    const record = await prisma.roleTemplate.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: {
        name: role.name,
        description: role.description,
        isSystem: true,
        scopeType: role.scopeType,
      },
      create: {
        orgId,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        scopeType: role.scopeType,
      },
    });
    roleRecords.push({ id: record.id, key: record.key });
  }

  await seedRolePermissions(roleRecords, ROLE_TEMPLATE_PERMISSION_MAP);
}

async function seedPlatformRoles() {
  const roleRecords = [];
  for (const role of PLATFORM_ROLE_TEMPLATE_DEFINITIONS) {
    const existing = await prisma.roleTemplate.findFirst({
      where: { orgId: null, key: role.key },
    });
    const record = existing
      ? await prisma.roleTemplate.update({
          where: { id: existing.id },
          data: {
            name: role.name,
            description: role.description,
            isSystem: true,
            scopeType: role.scopeType,
          },
        })
      : await prisma.roleTemplate.create({
          data: {
            orgId: null,
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: true,
            scopeType: role.scopeType,
          },
        });
    roleRecords.push({ id: record.id, key: record.key });
  }

  await seedRolePermissions(roleRecords, PLATFORM_ROLE_TEMPLATE_PERMISSION_MAP);
}

async function seedRolesForExistingOrgs() {
  const orgs = await prisma.org.findMany({ select: { id: true } });
  for (const org of orgs) {
    await seedOrgRoles(org.id);
  }
}

async function seedBuilding(orgId: string) {
  const existing = await prisma.building.findFirst({
    where: {
      orgId,
      name: 'Towerdesk HQ',
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.building.create({
    data: {
      orgId,
      name: 'Towerdesk HQ',
      city: 'Dubai',
      emirate: 'Dubai',
      country: 'ARE',
      timezone: 'Asia/Dubai',
    },
  });
}

async function main() {
  await seedPermissions();
  await seedPlatformRoles();

  if (isProduction) {
    await seedRolesForExistingOrgs();
    return;
  }

  const org = await seedOrg();
  await seedRolesForExistingOrgs();
  await seedUnitTypes(org.id);
  await seedOrgAdmin(org.id);
  await seedPlatformSuperadmin();
  await seedBuilding(org.id);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
