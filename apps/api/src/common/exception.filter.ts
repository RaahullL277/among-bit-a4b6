import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';

/**
 * Maps domain errors thrown by @acp/core into HTTP responses. Errors are
 * matched by name so the core layer stays free of any HTTP/Nest dependency.
 */
const STATUS_BY_ERROR: Record<string, number> = {
  AuthError: 401,
  ValidationError: 400,
  NotFoundError: 404,
};

@Catch()
export class CoreExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return res.status(status).json({ error: exception.message });
    }

    const err = exception as { name?: string; message?: string };
    const status = (err.name && STATUS_BY_ERROR[err.name]) ?? 500;
    if (status === 500) {
      console.error('Unhandled error:', exception);
    }
    res.status(status).json({ error: err.message ?? 'Internal server error' });
  }
}
