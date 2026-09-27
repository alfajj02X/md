import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, Skeleton } from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { maskPhone } from '@/domain/validators';
import { useAddresses, useDeleteAddress } from '@/lib/customer';
import { useAuth } from '@/stores/auth';

export default function CustomerAccount() {
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const { data: addresses, isLoading } = useAddresses();
  const deleteAddress = useDeleteAddress();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You will need your mobile number to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
            router.replace('/');
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  const onDeleteAddress = (id: string, label: string) => {
    Alert.alert('Remove address?', `"${label}" will be removed from your saved addresses.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteAddress.mutate(id) },
    ]);
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Account</Text>

      <Card variant="outlined" style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.display_name ?? 'M').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.display_name ?? 'Mechanic Dekho user'}</Text>
        <Text style={styles.phone}>
          {session?.user.phone ? maskPhone(session.user.phone) : ''}
        </Text>
        <Text style={styles.role}>Customer · Berhampore, Murshidabad</Text>
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Saved addresses</Text>
        <Pressable onPress={() => router.push('/(customer)/book/address')} accessibilityRole="button">
          <Text style={styles.link}>Manage</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.gap}>
          <Skeleton height={72} radius={radii.lg} />
          <Skeleton height={72} radius={radii.lg} />
        </View>
      ) : !addresses || addresses.length === 0 ? (
        <EmptyState
          title="No saved addresses"
          message="Add one when you book your next service."
          actionTitle="Add address"
          onAction={() => router.push('/(customer)/book/address')}
        />
      ) : (
        <Card variant="outlined" style={styles.listCard}>
          {addresses.map((a, i) => (
            <View key={a.id}>
              <View style={styles.addrRow}>
                <View style={styles.addrInfo}>
                  <Text style={styles.addrLabel}>
                    {a.label}
                    {a.is_default ? <Text style={styles.defaultTag}> · Default</Text> : null}
                  </Text>
                  <Text style={styles.addrText} numberOfLines={2}>
                    {a.line1}, {a.locality}, {a.city} {a.pincode}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onDeleteAddress(a.id, a.label)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${a.label} address`}
                  hitSlop={12}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
              {i < addresses.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>
      )}

      <View style={styles.footer}>
        <Button title="Sign out" variant="outline" onPress={onSignOut} loading={signingOut} />
        <Text style={styles.version}>Mechanic Dekho · v1.0.0</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h1, color: colors.text },
  card: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.h1, color: colors.primaryDark },
  name: { ...typography.h2, color: colors.text },
  phone: { ...typography.body, color: colors.textSecondary },
  role: { ...typography.caption, color: colors.textTertiary },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  link: { ...typography.bodyStrong, color: colors.primary },
  gap: { gap: spacing.sm },
  listCard: { padding: 0, overflow: 'hidden' },
  addrRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  addrInfo: { flex: 1, gap: 2 },
  addrLabel: { ...typography.bodyStrong, color: colors.text },
  defaultTag: { ...typography.caption, color: colors.primaryDark },
  addrText: { ...typography.caption, color: colors.textSecondary },
  remove: { ...typography.captionStrong, color: colors.error },
  divider: { height: 1, backgroundColor: colors.border },
  footer: { gap: spacing.md, marginTop: spacing.md },
  version: { ...typography.small, color: colors.textTertiary, textAlign: 'center' },
});
