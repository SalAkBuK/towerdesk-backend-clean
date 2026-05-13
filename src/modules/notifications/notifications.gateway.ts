import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createHash } from 'crypto';
import { Server, Socket } from 'socket.io';
import { env } from '../../config/env';
import { NotificationsService } from './notifications.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { AuthValidationService } from '../auth/auth-validation.service';
import { OwnerPortfolioScopeService } from '../owner-portfolio/owner-portfolio-scope.service';

const resolveWsCorsOrigins = () => {
  const raw = env.WS_CORS_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (raw && raw.length > 0) {
    return raw;
  }
  if (env.NODE_ENV !== 'production') {
    return '*';
  }
  return [];
};

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: resolveWsCorsOrigins(),
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);
  private connectedCount = 0;

  constructor(
    private readonly authValidationService: AuthValidationService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: NotificationsRealtimeService,
    private readonly ownerPortfolioScopeService: OwnerPortfolioScopeService,
  ) {}

  afterInit() {
    this.realtimeService.setServer(this.server);
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const orgIdOverride = this.extractOrgId(client);
      const payload = await this.authValidationService.verifyAccessToken(token);
      const user = await this.authValidationService.validatePayload(
        payload,
        orgIdOverride,
      );
      const orgIds = user.orgId
        ? [user.orgId]
        : await this.ownerPortfolioScopeService.listAccessibleOrgIds(user.sub);
      if (orgIds.length === 0) {
        client.disconnect();
        return;
      }

      client.data.userId = user.sub;
      client.data.orgIds = orgIds;
      for (const orgId of orgIds) {
        client.join(this.realtimeService.roomForUser(orgId, user.sub));
      }

      this.connectedCount += 1;
      this.logConnection('connected', client.id, orgIds, user.sub);

      const unreadCount = user.orgId
        ? await this.notificationsService.countUnread(user.sub, user.orgId)
        : await this.notificationsService.countUnreadAcrossOrgs(
            user.sub,
            orgIds,
          );
      client.emit('notifications:hello', { unreadCount });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.userId && Array.isArray(client.data?.orgIds)) {
      this.connectedCount = Math.max(0, this.connectedCount - 1);
      this.logConnection(
        'disconnected',
        client.id,
        client.data.orgIds,
        client.data.userId,
      );
    }
    client.data.userId = undefined;
    client.data.orgIds = undefined;
  }

  private extractToken(client: Socket) {
    const authHeader = client.handshake.headers.authorization;
    if (typeof authHeader === 'string') {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        return token.trim();
      }
    }

    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') {
      const trimmed = authToken.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') {
      const trimmed = queryToken.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    if (Array.isArray(queryToken) && queryToken.length > 0) {
      const trimmed = queryToken[0]?.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return null;
  }

  private extractOrgId(client: Socket) {
    const authOrgId = client.handshake.auth?.orgId;
    const queryOrgId = client.handshake.query?.orgId;
    if (authOrgId !== undefined) {
      return this.authValidationService.parseOrgIdOverride(authOrgId);
    }
    if (queryOrgId !== undefined) {
      return this.authValidationService.parseOrgIdOverride(queryOrgId);
    }
    return null;
  }

  private logConnection(
    event: 'connected' | 'disconnected',
    socketId: string,
    orgIds: string[],
    userId: string,
  ) {
    if (!env.WS_LOG_CONNECTIONS) {
      return;
    }
    this.logger.log(
      {
        event,
        socketId,
        orgCount: orgIds.length,
        org: orgIds[0] ? this.hashValue(orgIds[0]) : undefined,
        user: this.hashValue(userId),
        connections: this.connectedCount,
      },
      'ws connection',
    );
  }

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 8);
  }
}
