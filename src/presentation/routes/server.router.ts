import { Router } from 'express';
import { ServerController } from '../controllers/server.controller';
import type { IBaseRouter } from './base.routers';
import type { IAppContext } from '../../domain/repositories/app-context.interface';
import {
  validateBody,
  validateParams,
} from '../middlewares/validate.middleware';
import {
  createServerSchema,
  serverParamsSchema,
} from '../schemas/server.schema';

export class ServerRouter implements IBaseRouter {
  router = Router();
  basePath = 'server';
  private controller: ServerController;

  constructor(appContext: IAppContext) {
    this.controller = new ServerController(appContext);

    this.router.get(`/`, this.controller.listServers);
    this.router.post(
      `/`,
      validateBody(createServerSchema),
      this.controller.createServer,
    );

    this.router.get(
      `/:instanceId`,
      validateParams(serverParamsSchema),
      this.controller.getServer,
    );
    this.router.post(
      `/:instanceId/start`,
      validateParams(serverParamsSchema),
      this.controller.startServer,
    );
    this.router.post(
      `/:instanceId/stop`,
      validateParams(serverParamsSchema),
      this.controller.stopServer,
    );
  }
}

export const serverRouter = (appContext: IAppContext) =>
  new ServerRouter(appContext);
