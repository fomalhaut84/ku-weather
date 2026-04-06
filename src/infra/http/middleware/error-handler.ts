import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../utils/logger';

export function errorHandler(environment: string) {
  return (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: environment === 'development' ? err.message : undefined,
    });
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    path: _req.path,
  });
}
