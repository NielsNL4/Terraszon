export function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Afgebroken', 'AbortError');
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
  if (signal.aborted) throw aborted(signal);
  const controller = new AbortController();
  const stop = () => controller.abort(aborted(signal));
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('De databron reageerde niet op tijd', 'TimeoutError')), milliseconds);
  try {
    return await abortable((async () => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Databron gaf status ${response.status}`);
      return await response.json() as T;
    })(), controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}
