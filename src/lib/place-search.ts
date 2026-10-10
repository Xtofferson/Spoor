import { useEffect, useState } from 'react';

import { rankSuggestions, type LonLat, type PlaceCandidate } from '@/lib/route-math';
import { orsFetch, RouteError } from '@/lib/route-plan';

/** Fewer letters than this match too much to be useful, and waste lookups. */
const MIN_LETTERS = 3;
/** Wait for a pause in typing before looking anything up. */
const DEBOUNCE_MS = 600;

// The free OpenRouteService plan allows only about 100 suggestion lookups a day,
// so the same text near the same place is only ever looked up once per app session.
const cache = new Map<string, PlaceCandidate[]>();

function cacheKey(query: string, near?: LonLat) {
  const around = near ? `${near[0].toFixed(1)},${near[1].toFixed(1)}` : 'anywhere';
  return `${query.toLowerCase()}@${around}`;
}

/** Up to six places matching what's been typed, nearest to `near` first. */
async function suggestPlaces(query: string, near?: LonLat): Promise<PlaceCandidate[]> {
  const key = cacheKey(query, near);
  const cached = cache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({ text: query, layers: 'venue,coarse' });
  if (near) {
    params.set('focus.point.lon', String(near[0]));
    params.set('focus.point.lat', String(near[1]));
  }
  const body = await orsFetch(`/geocode/autocomplete?${params}`);
  const candidates: PlaceCandidate[] = (body.features ?? []).map((feature: any) => ({
    coordinates: feature.geometry.coordinates,
    name: feature.properties.name ?? '',
    label: feature.properties.label ?? feature.properties.name ?? query,
    layer: feature.properties.layer ?? '',
  }));
  const suggestions = rankSuggestions(query, [candidates], near);
  cache.set(key, suggestions);
  return suggestions;
}

export type PlaceSuggestions = {
  suggestions: PlaceCandidate[];
  loading: boolean;
  /** Set when lookups failed, e.g. offline or over the daily limit. */
  error?: string;
};

/** Place suggestions for what's being typed into a stop. Pass an empty query to turn it off. */
export function usePlaceSuggestions(query: string, near?: LonLat): PlaceSuggestions {
  const text = query.trim();
  const active = text.length >= MIN_LETTERS;
  // Strings, so the effect depends on the place by value.
  const nearKey = near ? `${near[0]},${near[1]}` : '';
  const request = `${text}|${nearKey}`;
  const [result, setResult] = useState<{ request: string; value: PlaceSuggestions } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const around = nearKey ? (nearKey.split(',').map(Number) as LonLat) : undefined;
      suggestPlaces(text, around)
        .then((suggestions) => {
          if (!cancelled) setResult({ request, value: { suggestions, loading: false } });
        })
        .catch((error: unknown) => {
          const message =
            error instanceof RouteError ? error.message : 'Couldn’t look up places right now.';
          if (!cancelled) setResult({ request, value: { suggestions: [], loading: false, error: message } });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, text, nearKey, request]);

  if (!active) return { suggestions: [], loading: false };
  if (result?.request === request) return result.value;
  return { suggestions: [], loading: true };
}
