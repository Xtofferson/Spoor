/**
 * Requests that are under way, by what they're for, so screens that need the same thing at
 * the same time (e.g. the Trips card and the open trip) share one request instead of each
 * spending OpenRouteService or Overpass quota on it.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Starts `start()` unless a request for `key` is already under way, in which case that one is
 * shared. Anything `start` does with the result (saving it, sharing it) happens once.
 */
export function shareRequest<T>(key: string, start: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const request = start().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
