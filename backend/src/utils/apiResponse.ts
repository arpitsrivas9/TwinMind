export type ApiErrorBody = {
  success: false;
  error: string;
  details?: Record<string, unknown>;
};

export type ApiSuccessBody<T> = {
  success: true;
  data: T;
};

export const successResponse = <T>(data: T): ApiSuccessBody<T> => ({
  success: true,
  data,
});

export const errorResponse = (error: string, details?: Record<string, unknown>): ApiErrorBody => ({
  success: false,
  error,
  ...(details ? { details } : {}),
});
