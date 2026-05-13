import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgScopeGuard } from '../../common/guards/org-scope.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  BuildingReadAccess,
  BuildingWriteAccess,
} from '../../common/decorators/building-access.decorator';
import { BuildingAccessGuard } from '../../common/guards/building-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-context';
import { CreateUnitDto } from './dto/create-unit.dto';
import { ListUnitsQueryDto, UnitInclude } from './dto/list-units.query.dto';
import { UnitResponseDto, toUnitResponse } from './dto/unit.response.dto';
import {
  UnitBasicResponseDto,
  toUnitBasicResponse,
} from './dto/unit-basic.response.dto';
import {
  UnitDetailResponseDto,
  toUnitDetailResponse,
} from './dto/unit-detail.response.dto';
import {
  UnitWithOccupancyResponseDto,
  toUnitWithOccupancyResponse,
} from './dto/unit-with-occupancy.response.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitsService } from './units.service';
import { ImportUnitsQueryDto } from './dto/import-units.query.dto';
import { ImportUnitsResponseDto } from './dto/import-units.response.dto';

@ApiTags('org-units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgScopeGuard, BuildingAccessGuard)
@Controller('org/buildings/:buildingId/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post('import')
  @BuildingWriteAccess(true)
  @RequirePermissions('units.write')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ImportUnitsResponseDto })
  async importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @UploadedFile()
    file:
      | { buffer: Buffer; originalname?: string; mimetype?: string }
      | undefined,
    @Query() query: ImportUnitsQueryDto,
  ) {
    return this.unitsService.importCsv(user, buildingId, file, query);
  }

  @Post()
  @BuildingWriteAccess(true)
  @RequirePermissions('units.write')
  @ApiOkResponse({ type: UnitResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateUnitDto,
  ) {
    const unit = await this.unitsService.create(user, buildingId, dto);
    return toUnitResponse(unit);
  }

  @Get()
  @BuildingReadAccess()
  @RequirePermissions('units.read')
  @ApiOkResponse({ type: [UnitResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Query() query: ListUnitsQueryDto,
  ): Promise<UnitResponseDto[] | UnitWithOccupancyResponseDto[]> {
    if (query.include === UnitInclude.OCCUPANCY) {
      const units = await this.unitsService.listWithOccupancy(user, buildingId);
      return units.map(toUnitWithOccupancyResponse);
    }

    const units = await this.unitsService.list(
      user,
      buildingId,
      query.available,
    );
    return units.map(toUnitResponse);
  }

  @Get('basic')
  @BuildingReadAccess(true)
  @RequirePermissions('units.read')
  @ApiOkResponse({ type: [UnitBasicResponseDto] })
  async listBasic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    const units = await this.unitsService.list(user, buildingId);
    return units.map(toUnitBasicResponse);
  }

  @Get('count')
  @BuildingReadAccess()
  @RequirePermissions('units.read')
  @ApiOkResponse({
    schema: {
      example: { total: 120, vacant: 45 },
    },
  })
  async count(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
  ) {
    return this.unitsService.countVacant(user, buildingId);
  }

  @Get(':unitId')
  @BuildingReadAccess()
  @RequirePermissions('units.read')
  @ApiOkResponse({ type: UnitDetailResponseDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('unitId') unitId: string,
  ) {
    const unit = await this.unitsService.findById(user, buildingId, unitId);
    return toUnitDetailResponse(unit);
  }

  @Patch(':unitId')
  @BuildingWriteAccess(true)
  @RequirePermissions('units.write')
  @ApiOkResponse({ type: UnitDetailResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildingId') buildingId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateUnitDto,
  ) {
    const unit = await this.unitsService.update(user, buildingId, unitId, dto);
    return toUnitDetailResponse(unit);
  }
}
