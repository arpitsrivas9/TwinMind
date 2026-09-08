import { NextFunction, Request, Response } from 'express';
import { errorResponse } from '../utils/apiResponse';
import { logger } from '../lib/logger';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json(errorResponse('Route not found', { path: req.originalUrl }));
};

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const statusCode = error instanceof AppError ? error.statusCode : 500;

  logger.error('Unhandled application error', {
    name: error.name,
    message: error.message,
    statusCode,
  });

  res.status(statusCode).json(
    errorResponse(error instanceof AppError ? error.message : 'Internal server error'),
  );
};
