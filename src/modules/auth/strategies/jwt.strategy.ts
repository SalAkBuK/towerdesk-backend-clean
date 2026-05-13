import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { env } from '../../../config/env';
import { AuthValidationService, JwtPayload } from '../auth-validation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authValidationService: AuthValidationService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_ACCESS_SECRET,
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: JwtPayload) {
    const orgIdOverride = this.getOrgIdOverride(request);
    return this.authValidationService.validatePayload(payload, orgIdOverride);
  }

  private getOrgIdOverride(request: Request): string | null {
    const headerValue = request.headers['x-org-id'];
    const orgId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!orgId) {
      return null;
    }
    return this.authValidationService.parseOrgIdOverride(orgId);
  }
}
