import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';
import { setSuppliesUser } from '@/lib/supplies';
import { setTripsUser } from '@/lib/trips';
import { setVehicleUser } from '@/lib/vehicle';

type AuthState = {
  session: Session | null;
  /** True until the saved session (if any) has been read from the phone. */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    // Fires straight away with the saved session, then on every sign-in and sign-out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Switch trip lists before rendering, so screens never show the previous user's trips.
      setTripsUser(session?.user.id ?? null);
      setVehicleUser(session?.user.id ?? null);
      setSuppliesUser(session?.user.id ?? null);
      setState({ session, loading: false });
    });
    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return use(AuthContext);
}
