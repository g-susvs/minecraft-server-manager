import type { Router } from 'express';

export interface IBaseRouter {
  basePath: string;
  router: Router;
}
