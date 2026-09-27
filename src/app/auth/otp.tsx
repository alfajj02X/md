import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, OTPInput } from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { useAuth } from '@/stores/auth';

const RESEND_SECONDS = 30;

/**
 * OTP verification. On success the gate (index) routes by profile role.
 */
export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const verifyOtp = useAuth((s) => s.verifyOtp);
  const sendOtp = useAuth((s) => s.sendOtp);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, c - 1);
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const onVerify = async () => {
    if (code.length !== 6 || !phone) return;
    setError(undefined);
    setVerifying(true);
    try {
      await verifyOtp(phone, code);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work. Try again.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (!phone || cooldown > 0) return;
    try {
      await sendOtp(phone);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend the code.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Enter the code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to {phone ?? 'your number'}. It expires in 10 minutes.
          </Text>
        </View>
        <OTPInput value={code} onChange={setCode} error={error} />
        <View style={styles.footer}>
          <Button
            title="Verify"
            onPress={onVerify}
            loading={verifying}
            disabled={code.length !== 6}
          />
          <Button
            title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            onPress={onResend}
            variant="ghost"
            disabled={cooldown > 0}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.xxl, gap: spacing.xxl },
  header: { marginTop: spacing.xxxl, gap: spacing.sm },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  footer: { marginTop: 'auto', gap: spacing.sm },
});
