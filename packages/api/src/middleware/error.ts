import type { ErrorHandler } from 'hono';

export const errorMiddleware: ErrorHandler = (err, c) => {
  console.error('Unhandled error:', err);

  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;

  return c.json({
    error: {
      code: status === 400 ? 'BAD_REQUEST'
        : status === 401 ? 'UNAUTHORIZED'
        : status === 404 ? 'NOT_FOUND'
        : 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  }, status as any);
};
