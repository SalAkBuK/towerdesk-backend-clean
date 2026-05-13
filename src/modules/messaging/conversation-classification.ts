import {
  ConversationCounterpartyGroup,
  ConversationType,
} from '@prisma/client';

type ParticipantRoleBucketInput = {
  ownerUserIds: string[];
  staffUserIds: string[];
  tenantUserIds: string[];
};

export const counterpartyGroupByConversationType: Record<
  ConversationType,
  ConversationCounterpartyGroup
> = {
  [ConversationType.MANAGEMENT_INTERNAL]: ConversationCounterpartyGroup.STAFF,
  [ConversationType.MANAGEMENT_TENANT]: ConversationCounterpartyGroup.TENANT,
  [ConversationType.MANAGEMENT_OWNER]: ConversationCounterpartyGroup.OWNER,
  [ConversationType.OWNER_TENANT]: ConversationCounterpartyGroup.MIXED,
};

export const getCounterpartyGroupForConversationType = (
  type: ConversationType,
) => counterpartyGroupByConversationType[type];

export const inferConversationClassification = (
  input: ParticipantRoleBucketInput,
): {
  type: ConversationType;
  counterpartyGroup: ConversationCounterpartyGroup;
} | null => {
  const hasStaff = input.staffUserIds.length > 0;
  const hasTenant = input.tenantUserIds.length > 0;
  const hasOwner = input.ownerUserIds.length > 0;

  if (hasStaff && !hasTenant && !hasOwner) {
    return {
      type: ConversationType.MANAGEMENT_INTERNAL,
      counterpartyGroup: ConversationCounterpartyGroup.STAFF,
    };
  }

  if (hasStaff && hasTenant && !hasOwner) {
    return {
      type: ConversationType.MANAGEMENT_TENANT,
      counterpartyGroup: ConversationCounterpartyGroup.TENANT,
    };
  }

  if (hasStaff && hasOwner && !hasTenant) {
    return {
      type: ConversationType.MANAGEMENT_OWNER,
      counterpartyGroup: ConversationCounterpartyGroup.OWNER,
    };
  }

  if (!hasStaff && hasTenant && hasOwner) {
    return {
      type: ConversationType.OWNER_TENANT,
      counterpartyGroup: ConversationCounterpartyGroup.MIXED,
    };
  }

  return null;
};
