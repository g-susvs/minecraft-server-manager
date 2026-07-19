import type { NextFunction, Request, Response } from 'express';
import { Logger } from '../../libs/logger';

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  const message =
    error instanceof Error ? error.message : 'Internal server error';

  Logger.error(error);

  return res.status(statusCode).json({
    message,
    success: false,
  });
};
