import { ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceProviderUserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateProviderStaffDto {
  @ApiPropertyOptional({ enum: ServiceProviderUserRole })
  @IsOptional()
  @IsEnum(ServiceProviderUserRole)
  role?: ServiceProviderUserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
