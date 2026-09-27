import { Redirect } from 'expo-router';
import { useAuth } from '@/stores/auth';

/**
 * Boot gate: sends the user to auth, role selection, or their home group.
 */
export default function Gate() {
  const session = useAuth((s) => s.session);
  const profile = useAuth((s) => s.profile);

  if (!session) return <Redirect href="/auth/phone" />;
  if (!profile) return <Redirect href="/auth/role" />;
  return <Redirect href={profile.role === 'provider' ? '/(provider)' : '/(customer)'} />;
}
