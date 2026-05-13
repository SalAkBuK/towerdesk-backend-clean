CREATE TYPE "MaintenanceRequestEmergencySignal" AS ENUM ('ACTIVE_LEAK', 'NO_POWER', 'SAFETY_RISK', 'NO_COOLING');

ALTER TABLE "MaintenanceRequest"
ADD COLUMN "emergencySignals" "MaintenanceRequestEmergencySignal"[] NOT NULL DEFAULT ARRAY[]::"MaintenanceRequestEmergencySignal"[];
