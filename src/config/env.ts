/**
 * Typed environment access. All values are public (EXPO_PUBLIC_*) — never
 * put secrets here. The service-role key and Razorpay secret live only in
 * Supabase Edge Functions.
 *
 * Note: env vars are read with static key access (no dynamic process.env[name])
 * so Expo can inline them at build time.
 */

function requiredUrl(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error(
      'Missing environment variable EXPO_PUBLIC_SUPABASE_URL. Copy .env.example to .env and fill it in.',
    );
  }
  return value;
}

function requiredAnonKey(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(
      'Missing environment variable EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in.',
    );
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return requiredUrl();
  },
  get supabaseAnonKey(): string {
    return requiredAnonKey();
  },
  get razorpayKeyId(): string | undefined {
    return process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;
  },
  get easProjectId(): string | undefined {
    return process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  },
  /** True when backend credentials are configured. */
  get isBackendConfigured(): boolean {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    return url.length > 0 && !url.includes('your-project');
  },
};
