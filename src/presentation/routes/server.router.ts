import { Router } from 'express';
import { ServerController } from '../controllers/server.controller';
import type { IBaseRouter } from './base.routers';

class ServerRouter implements IBaseRouter {
  router = Router();
  basePath = 'server';
  private controller = new ServerController();

  constructor() {
    this.router.get(`/`, this.controller.listServers);
    this.router.post(`/`, this.controller.createServer);
  }
}

export const serverRouter = new ServerRouter();
