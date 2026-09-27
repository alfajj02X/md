/**
 * Supabase client singleton.
 * Auth sessions persist in expo-secure-store (never in plain storage).
 * Backend credentials come from .env; the app refuses to boot network
 * features without them (see env.isBackendConfigured).
 */
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { env } from '../config/env';
import type { Database } from './types';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let client: SupabaseClient<Database> | null = null;

/** Lazily create the client so env errors surface at first use, not import. */
export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: SecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** For tests: reset the singleton. */
export function __resetSupabaseForTests(): void {
  client = null;
}
