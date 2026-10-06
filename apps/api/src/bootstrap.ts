import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { AppModule } from './app.module';
import { ApiError } from './common/api-error';
import { ApiErrorFilter } from './common/api-error.filter';
import type { ApiRequest } from './common/request';
import { readConfig, type ApiConfig } from './config';

export async function createApplication(config: ApiConfig = readConfig()): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config));
  app.disable('x-powered-by');
  app.use((request: ApiRequest, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    response.setHeader('x-request-id', request.requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  // Delivery photos arrive as base64 JSON (<= 2 MB decoded); keep every other body small via DTO length limits.
  app.useBodyParser('json', { limit: '3mb' });
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => new ApiError(400, 'VALIDATION_FAILED', 'Correct the highlighted fields and try again.',
      Object.fromEntries(errors.map((error) => [error.property, Object.values(error.constraints ?? { invalid: 'Invalid value.' })]))),
  }));
  app.enableShutdownHooks();
  return app;
}
