import express, { type Application } from 'express';
import { environment } from './infraestructure/config/environment.js';

export class Server {
  app: Application;
  port = environment.port;

  constructor() {
    this.app = express();
  }

  listen() {
    this.app.listen(this.port, () => {
      console.log(`Running in port: ${this.port}`);
    });
  }
}
