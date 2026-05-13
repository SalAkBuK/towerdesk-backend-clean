import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

type RealtimeEvent =
  | 'notifications:new'
  | 'notifications:read'
  | 'notifications:read_all'
  | 'notifications:dismiss'
  | 'notifications:undismiss'
  | 'conversation:new'
  | 'conversation:read'
  | 'message:new';

@Injectable()
export class NotificationsRealtimeService {
  private server: Server | undefined;

  setServer(server: Server) {
    this.server = server;
  }

  roomForUser(orgId: string, userId: string) {
    return `org:${orgId}:user:${userId}`;
  }

  publishToUser(
    orgId: string,
    userId: string,
    event: RealtimeEvent,
    payload: unknown,
  ) {
    if (!this.server) {
      return;
    }
    this.server.to(this.roomForUser(orgId, userId)).emit(event, payload);
  }
}
