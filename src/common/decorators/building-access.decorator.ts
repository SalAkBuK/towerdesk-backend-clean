import { applyDecorators, SetMetadata } from '@nestjs/common';

export type BuildingAccessLevel = 'read' | 'write';

export const BUILDING_ACCESS_LEVEL_KEY = 'building_access_level';
export const BUILDING_RESIDENT_ALLOWED_KEY = 'building_resident_allowed';
export const BUILDING_MANAGER_WRITE_ALLOWED_KEY =
  'building_manager_write_allowed';

export const BuildingReadAccess = (allowResident = false) =>
  applyDecorators(
    SetMetadata(BUILDING_ACCESS_LEVEL_KEY, 'read'),
    SetMetadata(BUILDING_RESIDENT_ALLOWED_KEY, allowResident),
  );

export const BuildingWriteAccess = (allowManager = false) =>
  applyDecorators(
    SetMetadata(BUILDING_ACCESS_LEVEL_KEY, 'write'),
    SetMetadata(BUILDING_MANAGER_WRITE_ALLOWED_KEY, allowManager),
  );
