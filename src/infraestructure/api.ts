import express, { type Application } from 'express';
import { serverRouter } from '../presentation/routes/server.router';
import { AppContext } from './config/app-context';
import type { IAppContext } from '../domain/repositories/app-context.interface';
import { docsRouter } from '../presentation/docs/docs.router';
import { corsMiddleware } from '../presentation/middlewares/cors.middleware';

class Api {
  api: Application;
  appContext: IAppContext;

  constructor() {
    this.api = express();
    this.appContext = new AppContext();

    this.api.use(corsMiddleware);

    this.api.get('/health', (_req, res) => {
      return res.status(200).json({
        message: 'OK',
        success: true,
      });
    });

    this.api.use('/docs', docsRouter);

    const routes = this.routes();
    routes.forEach((routerInstance) => {
      this.api.use(`/${routerInstance.basePath}`, routerInstance.router);
    });
  }

  routes() {
    return [serverRouter].map((routerClass) => routerClass(this.appContext));
  }
}

export const api = new Api().api;
