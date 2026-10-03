import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiRequest } from './request';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<ApiRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const detail = exception instanceof HttpException ? exception.getResponse() : undefined;
    let code = status === 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`;
    let message = status === 500 ? 'The request could not be completed. Try again or contact an administrator.' : 'The request could not be completed.';
    let fieldErrors: unknown;
    if (typeof detail === 'string') message = detail;
    if (typeof detail === 'object' && detail !== null) {
      if ('code' in detail && typeof detail.code === 'string') code = detail.code;
      if ('message' in detail && typeof detail.message === 'string') message = detail.message;
      if ('fieldErrors' in detail) fieldErrors = detail.fieldErrors;
    }
    if (status >= 500) this.logger.error(`Request ${request.requestId} failed (${code}).`);
    response.status(status).json({ code, message, ...(fieldErrors ? { fieldErrors } : {}), requestId: request.requestId });
  }
}
