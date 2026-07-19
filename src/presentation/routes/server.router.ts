import { Router } from 'express';
import { ServerController } from '../controllers/server.controller';
import type { IBaseRouter } from './base.routers';
import type { IAppContext } from '../../domain/repositories/app-context.interface';

export class ServerRouter implements IBaseRouter {
  router = Router();
  basePath = 'server';
  private controller: ServerController;

  constructor(appContext: IAppContext) {
    this.controller = new ServerController(appContext);

    this.router.get(`/`, this.controller.listServers);
    this.router.post(`/`, this.controller.createServer);
  }
}

export const serverRouter = (appContext: IAppContext) =>
  new ServerRouter(appContext);
