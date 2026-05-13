import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { AuthRepo } from './auth.repo';

export type JwtPayload = {
  sub: string;
  email?: string;
  orgId?: string | null;
};

@Injectable()
export class AuthValidationService {
  constructor(
    private readonly authRepo: AuthRepo,
    private readonly jwtService: JwtService,
  ) {}

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  async validatePayload(payload: JwtPayload, orgIdOverride?: string | null) {
    const userId = payload.sub;
    const user = await this.authRepo.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Unauthorized');
    }

    const userOrgId = user.orgId ?? null;
    let effectiveOrgId = userOrgId;
    if (!userOrgId && orgIdOverride) {
      const roleKeys = await this.authRepo.getRoleKeys(user.id, null);
      if (roleKeys.includes('platform_superadmin')) {
        effectiveOrgId = orgIdOverride;
      } else {
        throw new UnauthorizedException('Unauthorized');
      }
    }

    return {
      sub: user.id,
      email: user.email,
      orgId: effectiveOrgId,
    };
  }

  parseOrgIdOverride(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string') {
      throw new BadRequestException('Invalid org scope');
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const uuidV4ish =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidV4ish.test(trimmed)) {
      throw new BadRequestException('Invalid org scope');
    }

    return trimmed;
  }
}
