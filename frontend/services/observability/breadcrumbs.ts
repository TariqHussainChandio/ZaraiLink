/**
 * A seam for error tracking. Every API call reports one breadcrumb (method, path, status, request id, duration) here,
 * so that when an error tracker is installed (P7 7E, needs the maintainer's Sentry project) the id in a crash report
 * matches the `X-Request-ID` in the backend's logs. With no sink registered this does nothing, and nothing else in the
 * app knows the difference.
 */
export interface ApiBreadcrumb {
  method: string;
  path: string;
  /** 0 when no response arrived. */
  status: number;
  requestId: string;
  durationMs: number;
  errorCode?: string;
}

type BreadcrumbSink = (breadcrumb: ApiBreadcrumb) => void;

let sink: BreadcrumbSink | null = null;

// Sets (or clears) where API breadcrumbs are sent.
export function setBreadcrumbSink(next: BreadcrumbSink | null): void {
  sink = next;
}

// Sends one API breadcrumb to the sink, if one is set.
export function addApiBreadcrumb(breadcrumb: ApiBreadcrumb): void {
  sink?.(breadcrumb);
}
