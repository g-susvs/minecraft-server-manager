import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi';

export const docsRouter = Router();

docsRouter.get('/json', (_req, res) => {
  res.json(openApiSpec);
});

docsRouter.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'Minecraft Server Manager API',
    swaggerOptions: {
      url: '/api/docs/json',
      docExpansion: 'list',
      displayRequestDuration: true,
    },
  }),
);
