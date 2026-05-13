-- Drop legacy bridge tables and enums
DROP TABLE IF EXISTS "OccupancyBridge";
DROP TABLE IF EXISTS "UnitBridge";
DROP TABLE IF EXISTS "BuildingBridge";

DROP TYPE IF EXISTS "UnitBridgeStatus";
DROP TYPE IF EXISTS "UnitType";
DROP TYPE IF EXISTS "OwnershipType";
DROP TYPE IF EXISTS "WaterConnectionType";
DROP TYPE IF EXISTS "ParkingType";
DROP TYPE IF EXISTS "AreaUnit";
