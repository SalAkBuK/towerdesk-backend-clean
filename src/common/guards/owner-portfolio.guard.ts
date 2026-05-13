import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestContext } from '../types/request-context';
import { OwnerPortfolioScopeService } from '../../modules/owner-portfolio/owner-portfolio-scope.service';

@Injectable()
export class OwnerPortfolioGuard implements CanActivate {
  constructor(
    private readonly ownerPortfolioScopeService: OwnerPortfolioScopeService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const hasAccess =
      await this.ownerPortfolioScopeService.hasActiveOwnerAccess(userId);
    if (!hasAccess) {
      throw new ForbiddenException('Owner portfolio access not granted');
    }

    return true;
  }
}
