import type { NextFunction, Request, Response } from 'express';
import { Logger } from '../../libs/logger';
import { AppError } from '../../libs/app.error';

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof AppError && error.statusCode < 500) {
    // log de errores controlados
    Logger.log(`[${error.statusCode}] ${error.message}`);

    return res.status(error.statusCode).json({
      message: error.message,
      success: false,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  Logger.error(error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      success: false,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  const message =
    statusCode < 500 && error instanceof Error
      ? error.message
      : 'Internal server error';

  return res.status(statusCode).json({
    message,
    success: false,
  });
};
