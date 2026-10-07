export function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Afgebroken', 'AbortError');
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly retryAfterMs: number | null = null) {
    super(`Databron gaf status ${status}`);
    this.name = 'HttpError';
  }
}

export function retryAfterMilliseconds(value: string | null): number | null {
  if (value === null || !value.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    const milliseconds = seconds * 1_000;
    return seconds >= 0 && Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function requestDeadline(signal: AbortSignal, milliseconds: number) {
  if (signal.aborted) throw aborted(signal);
  const controller = new AbortController();
  const stop = () => controller.abort(aborted(signal));
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('De databron reageerde niet op tijd', 'TimeoutError')), milliseconds);
  return { signal: controller.signal, dispose() { clearTimeout(timer); signal.removeEventListener('abort', stop); } };
}

// Settle even when a browser/network implementation does not reject fetch or
// response.json() after abort. Late completions cannot update the caller.
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted(signal));
  return new Promise((resolve, reject) => {
    const stop = () => { signal.removeEventListener('abort', stop); reject(aborted(signal)); };
    signal.addEventListener('abort', stop, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', stop);
      if (signal.aborted) reject(aborted(signal)); else resolve(value);
    }, error => { signal.removeEventListener('abort', stop); reject(error); });
  });
}

export async function requestJSON<T>(url: URL | string, signal: AbortSignal, milliseconds: number,
  options: RequestInit = {}): Promise<T> {
  const deadline = requestDeadline(signal, milliseconds);
  try {
    return await abortable((async () => {
      const response = await fetch(url, { ...options, signal: deadline.signal });
      if (!response.ok) throw new HttpError(response.status, retryAfterMilliseconds(response.headers?.get('Retry-After') ?? null));
      return await response.json() as T;
    })(), deadline.signal);
  } finally {
    deadline.dispose();
  }
}
