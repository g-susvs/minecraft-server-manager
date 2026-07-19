import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../../libs/app.error';

type TRequestPart = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodType, part: TRequestPart = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || part,
        message: issue.message,
      }));

      return next(
        AppError.badRequest(
          `Error de validación en ${part}: ${details
            .map((d) => `${d.field} (${d.message})`)
            .join(', ')}`,
          details,
        ),
      );
    }

    // En Express 5 `query` y `params` son getters de solo lectura.
    if (part === 'body') {
      req.body = result.data;
    } else {
      Object.defineProperty(req, part, {
        value: result.data,
        configurable: true,
      });
    }

    return next();
  };

export const validateBody = (schema: ZodType) => validate(schema, 'body');
export const validateQuery = (schema: ZodType) => validate(schema, 'query');
export const validateParams = (schema: ZodType) => validate(schema, 'params');
