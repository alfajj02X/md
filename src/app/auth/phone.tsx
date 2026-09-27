import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TextField } from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { isValidIndianPhone, normalizeIndianPhone } from '@/domain/validators';
import { useAuth } from '@/stores/auth';

/**
 * Phone entry. Validates an Indian 10-digit mobile number and sends an OTP
 * via Supabase phone auth (Twilio-backed on the project).
 */
export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const sendOtp = useAuth((s) => s.sendOtp);

  const onContinue = async () => {
    if (!isValidIndianPhone(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    const e164 = normalizeIndianPhone(phone);
    setError(undefined);
    setSending(true);
    try {
      await sendOtp(e164);
      router.push({ pathname: '/auth/otp', params: { phone: e164 } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>Mechanic Dekho</Text>
          <Text style={styles.title}>Your trusted home-service pro, on demand</Text>
          <Text style={styles.subtitle}>
            Enter your mobile number to sign in or create an account.
          </Text>
        </View>
        <TextField
          label="Mobile number"
          value={phone}
          onChangeText={(t) => {
            setPhone(t.replace(/\D/g, '').slice(0, 10));
            if (error) setError(undefined);
          }}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          maxLength={10}
          error={error}
        />
        <View style={styles.footer}>
          <Button
            title="Send OTP"
            onPress={onContinue}
            loading={sending}
            disabled={phone.length !== 10}
          />
          <Text style={styles.disclaimer}>
            By continuing you agree to receive an SMS with a verification code. Standard
            SMS charges may apply.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.xxl, gap: spacing.xl },
  header: { marginTop: spacing.xxxl, gap: spacing.sm },
  brand: { ...typography.display, color: colors.primary },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  footer: { marginTop: 'auto', gap: spacing.md },
  disclaimer: { ...typography.small, color: colors.textTertiary, textAlign: 'center' },
});
