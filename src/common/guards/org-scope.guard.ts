import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestContext } from '../types/request-context';

@Injectable()
export class OrgScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const user = request.user;
    if (!user?.sub) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (!user.orgId) {
      throw new ForbiddenException('Org scope required');
    }
    return true;
  }
}
