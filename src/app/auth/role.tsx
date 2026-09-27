import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card } from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { useAuth } from '@/stores/auth';
import type { UserRole } from '@/supabase/types';

/**
 * First-run role selection. The choice is written once; only admins can
 * change it afterwards (enforced by the DB trigger).
 */
export default function RoleScreen() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const setRoleOnServer = useAuth((s) => s.setRole);

  const onContinue = async () => {
    if (!role) return;
    setSaving(true);
    setError(undefined);
    try {
      await setRoleOnServer(role);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const options: { role: UserRole; title: string; desc: string }[] = [
    {
      role: 'customer',
      title: 'I need a service',
      desc: 'Book trusted mechanics and home-service pros at your doorstep.',
    },
    {
      role: 'provider',
      title: 'I offer services',
      desc: 'Get jobs near you, earn on your schedule. KYC verification required.',
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text style={styles.title}>How will you use Mechanic Dekho?</Text>
        <View style={styles.options}>
          {options.map((o) => (
            <Card
              key={o.role}
              variant={role === o.role ? 'outlined' : 'elevated'}
              style={[styles.option, role === o.role && styles.selected]}
            >
              <Text
                style={styles.optionTitle}
                onPress={() => setRole(o.role)}
                accessibilityRole="radio"
                accessibilityState={{ selected: role === o.role }}
              >
                {o.title}
              </Text>
              <Text style={styles.optionDesc}>{o.desc}</Text>
            </Card>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.footer}>
          <Button title="Continue" onPress={onContinue} loading={saving} disabled={!role} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.xxl, gap: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.xxxl },
  options: { gap: spacing.md },
  option: { gap: spacing.xs },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  optionTitle: { ...typography.h3, color: colors.text },
  optionDesc: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.small, color: colors.error },
  footer: { marginTop: 'auto' },
});
