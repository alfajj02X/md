import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
import { START_OTP_LENGTH } from '../../domain/config';

/**
 * OTP code entry. Boxes auto-advance; backspace moves back.
 * `length` defaults to the start-service OTP length (6).
 */
export function OTPInput({
  value,
  onChange,
  length = START_OTP_LENGTH,
  error,
}: {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  error?: string;
}) {
  const refs = useRef<(TextInput | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const chars = value.padEnd(length, ' ').split('').slice(0, length);

  const setChar = (index: number, ch: string) => {
    const next = chars.slice();
    next[index] = ch;
    const code = next.join('').trim();
    onChange(code);
    if (ch && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !chars[index].trim() && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View accessibilityRole="none">
      <View style={styles.row} accessibilityLabel={`Enter ${length}-digit code`}>
        {chars.map((ch, i) => (
          <TextInput
            key={i}
            ref={(r) => {
              refs.current[i] = r;
            }}
            value={ch.trim()}
            onChangeText={(t) => setChar(i, t.replace(/\D/g, '').slice(-1))}
            onKeyPress={(e) => onKeyPress(i, e)}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            keyboardType="numeric"
            maxLength={1}
            selectTextOnFocus
            style={[
              styles.box,
              focused === i && styles.boxFocused,
              error ? styles.boxError : undefined,
            ]}
          />
        ))}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Stars({
  value,
  onRate,
  size = 36,
}: {
  value: number;
  onRate?: (stars: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.stars} accessibilityRole={onRate ? 'adjustable' : 'text'}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text
          key={s}
          accessibilityLabel={`${s} star${s > 1 ? 's' : ''}`}
          onPress={onRate ? () => onRate(s) : undefined}
          style={[styles.star, { fontSize: size, color: s <= value ? colors.accent : colors.borderStrong }]}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  box: {
    width: 48,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    ...typography.h1,
    color: colors.text,
  },
  boxFocused: { borderColor: colors.primary, borderWidth: 2 },
  boxError: { borderColor: colors.error },
  error: { ...typography.small, color: colors.error, marginTop: spacing.sm, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: spacing.xs },
  star: { lineHeight: 44 },
});
