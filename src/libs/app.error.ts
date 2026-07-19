/**
 * Error de aplicación con código HTTP asociado.
 *
 * Cualquier capa puede lanzarlo; `errorMiddleware` lo traduce a la respuesta
 * HTTP correspondiente en lugar de responder siempre 500.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(message, 400, details);
  }

  static notFound(message: string) {
    return new AppError(message, 404);
  }
}
