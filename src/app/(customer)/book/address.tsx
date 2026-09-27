import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ErrorState, Screen, Skeleton, TextField } from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { useAddresses, useDeleteAddress, useSaveAddress } from '@/lib/customer';
import { useBookingDraft } from '@/stores/bookingDraft';
import { ValidationError, type AddressInput } from '@/domain/validators';
import type { Address } from '@/supabase/types';

function AddressRow({
  address,
  selected,
  onSelect,
}: {
  address: Address;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${address.label}: ${address.line1}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>
          {address.label}
          {address.is_default ? <Text style={styles.defaultTag}> · Default</Text> : null}
        </Text>
        <Text style={styles.rowText} numberOfLines={2}>
          {address.line1}
          {address.landmark ? `, ${address.landmark}` : ''}, {address.locality},{' '}
          {address.city} {address.pincode}
        </Text>
        <Text style={styles.rowText}>
          {address.customer_name} · {address.phone}
        </Text>
      </View>
    </Pressable>
  );
}

const EMPTY_FORM: AddressInput = {
  label: 'Home',
  customerName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  locality: '',
  city: 'Berhampore',
  state: 'West Bengal',
  pincode: '',
};

export default function BookAddress() {
  const draftAddressId = useBookingDraft((s) => s.addressId);
  const setAddress = useBookingDraft((s) => s.setAddress);
  const serviceId = useBookingDraft((s) => s.serviceId);
  const { data: addresses, isLoading, error, refetch } = useAddresses();
  const saveAddress = useSaveAddress();
  const deleteAddress = useDeleteAddress();

  // The user's explicit pick; when null, fall back to the default (or first)
  // saved address. Derived during render instead of syncing in an effect.
  const [pickedId, setPickedId] = useState<string | null>(draftAddressId);
  const selectedId =
    pickedId ?? addresses?.find((a) => a.is_default)?.id ?? addresses?.[0]?.id ?? null;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddressInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    if (!serviceId) router.replace('/(customer)');
  }, [serviceId]);

  const set = (key: keyof AddressInput) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    setFormError(undefined);
    try {
      const saved = await saveAddress.mutateAsync(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setPickedId(saved.id);
    } catch (e) {
      setFormError(
        e instanceof ValidationError ? e.message : 'Could not save this address. Try again.',
      );
    }
  };

  const onContinue = () => {
    if (!selectedId) return;
    setAddress(selectedId);
    router.push('/(customer)/book/slot');
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Where should the professional come?</Text>

      {isLoading ? (
        <View style={styles.gap}>
          <Skeleton height={88} radius={radii.lg} />
          <Skeleton height={88} radius={radii.lg} />
        </View>
      ) : error ? (
        <ErrorState message="Could not load your addresses." onRetry={() => void refetch()} />
      ) : (
        <View style={styles.gap}>
          {(addresses ?? []).length === 0 && !showForm ? (
            <EmptyState
              title="No saved addresses"
              message="Add your first address to continue."
            />
          ) : (
            <Card variant="outlined" style={styles.listCard}>
              {(addresses ?? []).map((a, i) => (
                <View key={a.id}>
                  <AddressRow
                    address={a}
                    selected={selectedId === a.id}
                    onSelect={() => setPickedId(a.id)}
                  />
                  {i < (addresses ?? []).length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </Card>
          )}

          {!showForm ? (
            <Button
              title="+ Add new address"
              variant="outline"
              onPress={() => setShowForm(true)}
            />
          ) : (
            <Card variant="outlined" style={styles.gap}>
              <Text style={styles.formTitle}>New address</Text>
              <View style={styles.labelRow}>
                {['Home', 'Work', 'Other'].map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setForm((f) => ({ ...f, label: l }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: form.label === l }}
                    style={[styles.labelChip, form.label === l && styles.labelChipActive]}
                  >
                    <Text
                      style={[
                        styles.labelChipText,
                        form.label === l && styles.labelChipTextActive,
                      ]}
                    >
                      {l}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextField label="Full name" value={form.customerName} onChangeText={set('customerName')} placeholder="Your name" />
              <TextField label="Mobile number" value={form.phone} onChangeText={(t) => set('phone')(t.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" keyboardType="phone-pad" maxLength={10} />
              <TextField label="Address" value={form.addressLine1} onChangeText={set('addressLine1')} placeholder="House no, street, area" />
              <TextField label="Landmark (optional)" value={form.landmark ?? ''} onChangeText={set('landmark')} placeholder="Near…" />
              <View style={styles.twoCol}>
                <TextField label="Locality" value={form.locality} onChangeText={set('locality')} placeholder="e.g. Gorabazar" style={styles.col} />
                <TextField label="PIN code" value={form.pincode} onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))} placeholder="742101" keyboardType="numeric" maxLength={6} style={styles.col} />
              </View>
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <View style={styles.formActions}>
                <Button title="Cancel" variant="ghost" onPress={() => { setShowForm(false); setFormError(undefined); }} />
                <Button title="Save address" onPress={onSave} loading={saveAddress.isPending} />
              </View>
            </Card>
          )}

          {(addresses ?? []).length > 0 && selectedId && (
            <Text
              style={styles.deleteLink}
              onPress={() => {
                const a = addresses?.find((x) => x.id === selectedId);
                Alert.alert('Remove address?', `"${a?.label ?? 'This address'}" will be removed from your saved addresses.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => deleteAddress.mutate(selectedId) },
                ]);
              }}
              accessibilityRole="button"
            >
              Remove selected address
            </Text>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Button title="Continue" onPress={onContinue} disabled={!selectedId} size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h1, color: colors.text },
  gap: { gap: spacing.md },
  listCard: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
  pressed: { backgroundColor: colors.surfaceMuted },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  rowInfo: { flex: 1, gap: 2 },
  rowLabel: { ...typography.bodyStrong, color: colors.text },
  defaultTag: { ...typography.caption, color: colors.primaryDark },
  rowText: { ...typography.caption, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border },
  formTitle: { ...typography.h3, color: colors.text },
  labelRow: { flexDirection: 'row', gap: spacing.sm },
  labelChip: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  labelChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  labelChipText: { ...typography.captionStrong, color: colors.textSecondary },
  labelChipTextActive: { color: colors.textOnPrimary },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
  error: { ...typography.small, color: colors.error },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  deleteLink: { ...typography.caption, color: colors.error, textAlign: 'center' },
  footer: { marginTop: spacing.md },
});
