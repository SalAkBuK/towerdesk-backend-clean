import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../../config/env';
import { RequestContext } from '../../../common/types/request-context';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const refreshToken = request.body?.refreshToken;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
      request.user = payload;
      request.refreshToken = refreshToken;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
