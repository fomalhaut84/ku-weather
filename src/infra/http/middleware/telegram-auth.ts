import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../../utils/logger';

/**
 * Telegram Webhook 인증 미들웨어
 * timing-safe comparison으로 secret 검증
 */
export function telegramWebhookAuth(configuredSecret: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!configuredSecret) {
      logger.error('Telegram webhook secret is not configured. Rejecting request.');
      res.status(500).json({ ok: false, error: 'Webhook not configured' });
      return;
    }

    const providedSecret = req.get('x-telegram-bot-api-secret-token');
    if (!providedSecret) {
      logger.warn('Missing Telegram webhook secret token');
      res.status(403).json({ ok: false, error: 'Invalid webhook token' });
      return;
    }

    const providedSecretBuffer = Buffer.from(providedSecret, 'utf8');
    const configuredSecretBuffer = Buffer.from(configuredSecret, 'utf8');

    const secretsMatch =
      providedSecretBuffer.length === configuredSecretBuffer.length &&
      timingSafeEqual(providedSecretBuffer, configuredSecretBuffer);

    if (!secretsMatch) {
      logger.warn('Invalid Telegram webhook secret token received');
      res.status(403).json({ ok: false, error: 'Invalid webhook token' });
      return;
    }

    next();
  };
}
