import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme';

type CardVariant = 'elevated' | 'outlined' | 'flat';

export function Card({
  children,
  variant = 'elevated',
  style,
}: {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' && shadows.card,
        variant === 'elevated' && styles.elevated,
        variant === 'outlined' && styles.outlined,
        variant === 'flat' && styles.flat,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary';
}) {
  const tones = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, dot: colors.textTertiary },
    success: { bg: colors.successSoft, fg: colors.success, dot: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning, dot: colors.warning },
    error: { bg: colors.errorSoft, fg: colors.error, dot: colors.error },
    info: { bg: colors.infoSoft, fg: colors.info, dot: colors.info },
    primary: { bg: colors.primarySoft, fg: colors.primaryDark, dot: colors.primary },
  } as const;
  const t = tones[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: t.bg }]}
    >
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  elevated: {},
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  flat: {
    backgroundColor: colors.surfaceMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
