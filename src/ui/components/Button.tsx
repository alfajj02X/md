import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing, typography, TOUCH_TARGET } from '../theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

const variantStyles: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnPrimary },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark },
  outline: { bg: 'transparent', fg: colors.primaryDark, border: colors.borderStrong },
  ghost: { bg: 'transparent', fg: colors.primaryDark },
  danger: { bg: colors.error, fg: colors.textOnPrimary },
};

const sizeStyles: Record<Size, { height: number; paddingH: number; font: TextStyle }> = {
  sm: { height: 36, paddingH: spacing.md, font: typography.captionStrong },
  md: { height: 48, paddingH: spacing.xl, font: typography.button },
  lg: { height: 56, paddingH: spacing.xxl, font: typography.button },
};

/**
 * Primary CTA component. Shows a spinner + disables itself while loading so
 * double-taps can't fire duplicate mutations.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  haptic = true,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isDisabled ? colors.surfaceMuted : v.bg,
          borderColor: v.border ?? 'transparent',
          height: Math.max(s.height, TOUCH_TARGET),
          paddingHorizontal: s.paddingH,
          opacity: pressed && !isDisabled ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isDisabled ? colors.textTertiary : v.fg} />
      ) : (
        <Text
          style={[
            s.font,
            { color: isDisabled ? colors.textTertiary : v.fg, textAlign: 'center' },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
