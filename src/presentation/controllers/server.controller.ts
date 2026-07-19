import type { NextFunction, Request, Response } from 'express';
import { AppResponse } from '../responses/app.response';

export class ServerController {
  listServers(_req: Request, res: Response, next: NextFunction) {
    try {
      new AppResponse(res, { servers: [] });
    } catch (error) {
      next(error);
    }
  }

  createServer(_req: Request, res: Response, next: NextFunction) {
    try {
      new AppResponse(res, {});
    } catch (error) {
      next(error);
    }
  }
}
