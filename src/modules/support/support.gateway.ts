import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SupportConversation } from '../../database/entities/support-conversation.entity';
import { SupportMessage } from '../../database/entities/support-message.entity';

const AGENT_ROLES = ['admin', 'dispute_resolver', 'finance'];

/**
 * Real-time transport for support chat. Auth is by JWT on the handshake
 * (`socket.handshake.auth.token`). Message persistence stays in SupportService —
 * this gateway only authenticates, manages rooms, relays typing, and pushes
 * saved messages out live via the emit* methods the service calls.
 *
 * Rooms:
 *  - `user:<userId>`        the owning user's devices
 *  - `agents`               every connected support agent (inbox updates)
 *  - `conv:<conversationId>` anyone actively viewing that thread
 */
@WebSocketGateway({ namespace: '/support', cors: { origin: true, credentials: true } })
export class SupportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SupportGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.query?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('no token');

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const userId: string = payload.sub;
      const roles: string[] = payload.roles ?? [];
      client.data.userId = userId;
      client.data.roles = roles;
      client.data.isAgent = roles.some((r) => AGENT_ROLES.includes(r));

      if (client.data.isAgent) client.join('agents');
      client.join(`user:${userId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // rooms clean up automatically
  }

  /** Agent opens a thread — join its room to receive live messages + typing. */
  @SubscribeMessage('conversation:open')
  onOpen(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    if (data?.conversationId) client.join(`conv:${data.conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    if (data?.conversationId) client.leave(`conv:${data.conversationId}`);
  }

  /** Relay a typing indicator to the other side of the thread. */
  @SubscribeMessage('typing')
  onTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string; isTyping: boolean }) {
    if (!data?.conversationId) return;
    client.to(`conv:${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      from: client.data.isAgent ? 'agent' : 'user',
      isTyping: !!data.isTyping,
    });
  }

  // ─── Server-side emitters (called by SupportService after persistence) ──────────

  emitMessage(conversation: SupportConversation, message: SupportMessage) {
    const payload = { conversationId: conversation.id, message };
    this.server.to(`conv:${conversation.id}`).emit('message:new', payload);
    this.server.to(`user:${conversation.userId}`).emit('message:new', payload);
    this.server.to('agents').emit('message:new', payload);
  }

  emitConversationUpdated(conversation: SupportConversation) {
    this.server.to('agents').emit('conversation:updated', { conversation });
    this.server.to(`user:${conversation.userId}`).emit('conversation:updated', { conversation });
  }
}
