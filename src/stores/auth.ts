import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../supabase/client';
import type { Profile, UserRole } from '../supabase/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initialized: boolean;
  /** Load session + profile once at boot. */
  init: () => Promise<void>;
  /** Start phone OTP. Throws with a user-safe message on failure. */
  sendOtp: (phoneE164: string) => Promise<void>;
  /** Verify OTP code; loads profile afterwards. */
  verifyOtp: (phoneE164: string, code: string) => Promise<void>;
  /** Set the user's role (first run). Persists to profiles. */
  setRole: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  /** Refresh profile from the server. */
  refreshProfile: () => Promise<void>;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not load your profile. Please try again.');
  return data;
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initialized: false,

  init: async () => {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    let profile: Profile | null = null;
    if (session?.user) {
      try {
        profile = await loadProfile(session.user.id);
      } catch {
        profile = null;
      }
    }
    set({ session, profile, initialized: true });

    supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const prev = get().session?.user?.id;
      set({ session: nextSession });
      if (nextSession?.user && nextSession.user.id !== prev) {
        try {
          set({ profile: await loadProfile(nextSession.user.id) });
        } catch {
          set({ profile: null });
        }
      } else if (!nextSession) {
        set({ profile: null });
      }
    });
  },

  sendOtp: async (phoneE164) => {
    const { error } = await getSupabase().auth.signInWithOtp({ phone: phoneE164 });
    if (error) throw new Error('Could not send the code. Check the number and try again.');
  },

  verifyOtp: async (phoneE164, code) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: code,
      type: 'sms',
    });
    if (error || !data.session) {
      throw new Error('That code did not work. Please try again.');
    }
    const profile = await loadProfile(data.session.user.id).catch(() => null);
    set({ session: data.session, profile });
  },

  setRole: async (role) => {
    const { session } = get();
    if (!session?.user) throw new Error('You need to sign in first.');
    const { error } = await getSupabase().from('profiles').upsert(
      { id: session.user.id, role, phone: session.user.phone },
      { onConflict: 'id' },
    );
    if (error) throw new Error('Could not save your role. Please try again.');
    await get().refreshProfile();
  },

  signOut: async () => {
    const { session } = get();
    if (session?.user) {
      // Best-effort: stop push delivery to this device after sign-out.
      const { unregisterPushTokens } = await import('../lib/notifications');
      await unregisterPushTokens(session.user.id).catch(() => undefined);
    }
    await getSupabase().auth.signOut();
    set({ session: null, profile: null });
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session?.user) return;
    set({ profile: await loadProfile(session.user.id) });
  },
}));

/** Convenience selector: true when the signed-in user is a provider. */
export const selectIsProvider = (s: AuthState) => s.profile?.role === 'provider';
