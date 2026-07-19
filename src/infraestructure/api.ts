import express, { type Application } from 'express';
import { serverRouter } from '../presentation/routes/server.router';
import type { IBaseRouter } from '../presentation/routes/base.routers';

class Api {
  api: Application;

  constructor() {
    this.api = express();

    this.api.get('/health', (_req, res) => {
      return res.status(200).json({
        message: 'OK',
        success: true,
      });
    });

    const routes = this.routes();
    routes.forEach((r) => {
      this.api.use(`/${r.basePath}`, r.router);
    });
  }

  routes(): IBaseRouter[] {
    return [serverRouter];
  }
}

export const api = new Api().api;
