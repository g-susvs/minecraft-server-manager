import type { NextFunction, Request, Response } from 'express';
import { AppResponse } from '../responses/app.response';
import { ServerUseCases } from '../../application/server/server.use.cases';
import type { IAppContext } from '../../domain/repositories/app-context.interface';
import type { TCreateServerDto } from '../schemas/server.schema';

export class ServerController {
  private useCases: ServerUseCases;

  constructor(appContext: IAppContext) {
    this.useCases = new ServerUseCases(appContext);
  }

  listServers = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.useCases.listServers();
      new AppResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  createServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.useCases.createServer(
        req.body as TCreateServerDto,
      );
      new AppResponse(res, result);
    } catch (error) {
      next(error);
    }
  };
}
