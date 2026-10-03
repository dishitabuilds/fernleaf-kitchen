type ErrorPayload = { message?: string; code?: string; requestId?: string; fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> };

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly fieldErrors?: Record<string, string[]>, public readonly details?: Record<string, unknown>, public readonly requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Every business request travels over HTTP to NestJS through the Next.js rewrite.
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach the kitchen service. Check your connection and try again.');
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('fernleaf:session-expired'));
    const payload: ErrorPayload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.code ?? 'API_ERROR', payload.message ?? 'The request could not be completed. Please try again.', payload.fieldErrors, payload.details, payload.requestId);
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
