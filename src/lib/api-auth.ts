/**
 * The signed-in user's access token, for calling Spoor's Supabase Edge Functions (e.g. the
 * OpenRouteService one) without the planning code importing the Supabase client itself.
 * The Supabase client registers where the token comes from when it starts.
 */
let source: () => Promise<string | undefined> = async () => undefined;

export function setAccessTokenSource(next: () => Promise<string | undefined>) {
  source = next;
}

export function accessToken(): Promise<string | undefined> {
  return source();
}
