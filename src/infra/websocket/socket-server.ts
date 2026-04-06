import { Server as HttpServerType } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import { AlertChange } from '../../types/weather';

export interface SocketServerConfig {
  readonly corsOrigin: string;
}

/**
 * Socket.IO 서버
 * 실시간 특보 변동 브로드캐스트 담당
 */
export class SocketServer {
  private io: SocketIOServer;

  constructor(httpServer: HttpServerType, config: SocketServerConfig) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`[WebSocket] Client connected: ${socket.id}`);

      socket.on('disconnect', (reason) => {
        logger.info(`[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      socket.on('error', (error) => {
        logger.error(`[WebSocket] Socket error: ${socket.id}`, error);
      });
    });
  }

  /**
   * 특보 변동사항을 연결된 모든 클라이언트에 브로드캐스트
   */
  broadcastAlertChanges(changes: readonly AlertChange[]): void {
    for (const change of changes) {
      switch (change.type) {
        case 'NEW':
          if (change.current) {
            this.io.emit('alert:new', change.current);
            logger.debug(`[WebSocket] Broadcast alert:new - ${change.current.regionName} ${change.current.warningType}`);
          }
          break;

        case 'RESOLVED':
          if (change.previous) {
            const alertId = `${change.previous.regionId}_${change.previous.warningType}`;
            this.io.emit('alert:removed', alertId);
            logger.debug(`[WebSocket] Broadcast alert:removed - ${alertId}`);
          }
          break;

        case 'LEVEL_UP':
        case 'LEVEL_DOWN':
        case 'TIME_EXTENDED':
        case 'MODIFIED':
          if (change.current) {
            this.io.emit('alert:updated', change.current);
            logger.debug(`[WebSocket] Broadcast alert:updated - ${change.current.regionName} ${change.current.warningType}`);
          }
          break;
      }
    }

    logger.info(`[WebSocket] Broadcasted ${changes.length} alert changes to ${this.io.engine.clientsCount} clients`);
  }

  getClientCount(): number {
    return this.io.engine.clientsCount;
  }
}
