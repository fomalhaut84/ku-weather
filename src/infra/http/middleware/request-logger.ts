import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../utils/logger';

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.debug(`${req.method} ${req.path}`);
  next();
}
