import { isApiError } from '../services/api/errors';

/** What is safe to write to a log about a failure: the kind of error and its request id, never the request or response body. */
function describe(error: unknown): string {
  if (isApiError(error)) {
    return `${error.code} (status ${error.status}${error.requestId ? `, request ${error.requestId}` : ''})`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * The single place the app writes to the console. Everything else calls this, so what reaches a log can be
 * controlled in one spot (the reality gate fails any other `console` call in production code).
 */
export const logger = {
  warn(context: string, error?: unknown): void {
    console.warn(`[${context}]`, error === undefined ? '' : describe(error));
  },
};
