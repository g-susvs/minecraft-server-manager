import type { NextFunction, Request, Response } from 'express';
import { AppResponse } from '../responses/app.response';
import { ServerUseCases } from '../../application/server/server.use.cases';
import type { IAppContext } from '../../domain/repositories/app-context.interface';
import type {
  TCreateServerDto,
  TServerParamsDto,
} from '../schemas/server.schema';

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

  getServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { instanceId } = req.params as TServerParamsDto;
      const result = await this.useCases.getServerStatus(instanceId);
      new AppResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  startServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { instanceId } = req.params as TServerParamsDto;
      const status = await this.useCases.startServer(instanceId);
      new AppResponse(res, { instanceId, status });
    } catch (error) {
      next(error);
    }
  };

  stopServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { instanceId } = req.params as TServerParamsDto;
      const status = await this.useCases.stopServer(instanceId);
      new AppResponse(res, { instanceId, status });
    } catch (error) {
      next(error);
    }
  };
}
