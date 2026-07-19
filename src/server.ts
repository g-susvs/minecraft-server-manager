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
    this.errorHandling();
  }

  middlewares() {
    this.app.use(express.json());
  }

  routes() {
    this.app.use('/api', this.api);
  }

  errorHandling() {
    this.app.use(errorMiddleware);
  }

  listen() {
    this.app.listen(this.port, () => {
      console.log(`Running in port: ${this.port}`);
    });
  }
}
