import type { RequestHandler } from 'express';
import { environment } from '../../infraestructure/config/environment';

// Permite que el frontend (otro origen en desarrollo y producción) llame a la API desde el navegador.
// Los orígenes vienen de CORS_ORIGINS.
export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;

  if (origin && environment.cors.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  // El navegador envía una petición OPTIONS antes de las peticiones con body.
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
};
