CREATE TYPE "ConversationType_new" AS ENUM (
    'MANAGEMENT_INTERNAL',
    'MANAGEMENT_TENANT',
    'MANAGEMENT_OWNER',
    'OWNER_TENANT'
);

CREATE TYPE "ConversationCounterpartyGroup" AS ENUM (
    'STAFF',
    'TENANT',
    'OWNER',
    'MIXED'
);

ALTER TABLE "Conversation"
ADD COLUMN "type_new" "ConversationType_new",
ADD COLUMN "counterpartyGroup" "ConversationCounterpartyGroup";

WITH "staff_users" AS (
    SELECT DISTINCT
        ua."userId",
        r."orgId"
    FROM "UserAccessAssignment" ua
    INNER JOIN "Role" r
        ON r.id = ua."roleTemplateId"
    INNER JOIN "RolePermission" rp
        ON rp."roleId" = r.id
    INNER JOIN "Permission" p
        ON p.id = rp."permissionId"
    INNER JOIN "User" u
        ON u.id = ua."userId"
    WHERE p."key" = 'messaging.write'
      AND u."isActive" = true
), "tenant_users" AS (
    SELECT DISTINCT
        o."residentUserId" AS "userId",
        b."orgId"
    FROM "Occupancy" o
    INNER JOIN "Building" b
        ON b.id = o."buildingId"
    INNER JOIN "User" u
        ON u.id = o."residentUserId"
    WHERE o."status" = 'ACTIVE'
      AND u."isActive" = true
), "owner_users" AS (
    SELECT DISTINCT
        oag."userId",
        o."orgId"
    FROM "OwnerAccessGrant" oag
    INNER JOIN "Owner" o
        ON o.id = oag."ownerId"
    INNER JOIN "User" u
        ON u.id = oag."userId"
    WHERE oag."status" = 'ACTIVE'
      AND oag."userId" IS NOT NULL
      AND o."isActive" = true
      AND u."isActive" = true
), "participant_roles" AS (
    SELECT
        c."id" AS "conversationId",
        COALESCE(BOOL_OR(su."userId" IS NOT NULL), false) AS "hasStaff",
        COALESCE(BOOL_OR(tu."userId" IS NOT NULL), false) AS "hasTenant",
        COALESCE(BOOL_OR(ou."userId" IS NOT NULL), false) AS "hasOwner"
    FROM "Conversation" c
    LEFT JOIN "ConversationParticipant" cp
        ON cp."conversationId" = c."id"
    LEFT JOIN "staff_users" su
        ON su."userId" = cp."userId"
       AND su."orgId" = c."orgId"
    LEFT JOIN "tenant_users" tu
        ON tu."userId" = cp."userId"
       AND tu."orgId" = c."orgId"
    LEFT JOIN "owner_users" ou
        ON ou."userId" = cp."userId"
       AND ou."orgId" = c."orgId"
    GROUP BY c."id"
)
UPDATE "Conversation" c
SET
    "type_new" = CASE
        WHEN c."type" = 'RESIDENT_TO_MANAGEMENT' THEN 'MANAGEMENT_TENANT'::"ConversationType_new"
        WHEN c."type" = 'RESIDENT_TO_OWNER' THEN 'OWNER_TENANT'::"ConversationType_new"
        WHEN c."type" = 'OWNER_TO_MANAGEMENT' THEN 'MANAGEMENT_OWNER'::"ConversationType_new"
        WHEN c."type" = 'OWNER_TO_TENANT' THEN 'OWNER_TENANT'::"ConversationType_new"
        WHEN pr."hasStaff" = true AND pr."hasTenant" = false AND pr."hasOwner" = false THEN 'MANAGEMENT_INTERNAL'::"ConversationType_new"
        WHEN pr."hasStaff" = true AND pr."hasTenant" = true AND pr."hasOwner" = false THEN 'MANAGEMENT_TENANT'::"ConversationType_new"
        WHEN pr."hasStaff" = true AND pr."hasTenant" = false AND pr."hasOwner" = true THEN 'MANAGEMENT_OWNER'::"ConversationType_new"
        WHEN pr."hasStaff" = false AND pr."hasTenant" = true AND pr."hasOwner" = true THEN 'OWNER_TENANT'::"ConversationType_new"
        ELSE 'MANAGEMENT_INTERNAL'::"ConversationType_new"
    END,
    "counterpartyGroup" = CASE
        WHEN c."type" = 'RESIDENT_TO_MANAGEMENT' THEN 'TENANT'::"ConversationCounterpartyGroup"
        WHEN c."type" = 'OWNER_TO_MANAGEMENT' THEN 'OWNER'::"ConversationCounterpartyGroup"
        WHEN c."type" IN ('RESIDENT_TO_OWNER', 'OWNER_TO_TENANT') THEN 'MIXED'::"ConversationCounterpartyGroup"
        WHEN pr."hasStaff" = true AND pr."hasTenant" = false AND pr."hasOwner" = false THEN 'STAFF'::"ConversationCounterpartyGroup"
        WHEN pr."hasStaff" = true AND pr."hasTenant" = true AND pr."hasOwner" = false THEN 'TENANT'::"ConversationCounterpartyGroup"
        WHEN pr."hasStaff" = true AND pr."hasTenant" = false AND pr."hasOwner" = true THEN 'OWNER'::"ConversationCounterpartyGroup"
        WHEN pr."hasStaff" = false AND pr."hasTenant" = true AND pr."hasOwner" = true THEN 'MIXED'::"ConversationCounterpartyGroup"
        ELSE 'MIXED'::"ConversationCounterpartyGroup"
    END
FROM "participant_roles" pr
WHERE pr."conversationId" = c."id";

DROP INDEX IF EXISTS "Conversation_orgId_type_updatedAt_idx";

ALTER TABLE "Conversation"
DROP COLUMN "type";

ALTER TABLE "Conversation"
RENAME COLUMN "type_new" TO "type";

ALTER TABLE "Conversation"
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "counterpartyGroup" SET NOT NULL;

DROP TYPE "ConversationType";

ALTER TYPE "ConversationType_new"
RENAME TO "ConversationType";

CREATE INDEX "Conversation_orgId_type_updatedAt_idx"
ON "Conversation"("orgId", "type", "updatedAt");

CREATE INDEX "Conversation_orgId_counterpartyGroup_updatedAt_idx"
ON "Conversation"("orgId", "counterpartyGroup", "updatedAt");
