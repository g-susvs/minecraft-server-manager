import express, { type Application } from 'express';
import { environment } from './infraestructure/config/environment';
import { errorMiddleware } from './presentation/middlewares/error.middleware';
import { api } from './infraestructure/api';

export class Server {
  app: Application;
  private api: Application;
  port = environment.port;

  constructor() {
    this.app = express();
    this.api = api;

    this.middlewares();
    this.routes();
  }

  middlewares() {
    this.app.use(express.json());
    this.app.use(errorMiddleware);
  }

  routes() {
    this.app.use('/api', this.api);
  }

  listen() {
    this.app.listen(this.port, () => {
      console.log(`Running in port: ${this.port}`);
    });
  }
}
