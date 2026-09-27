/**
 * Mechanic Dekho design tokens.
 * Single source of truth for color, type, spacing, radii, shadows.
 * Light theme. Never encode status by color alone — pair with labels/icons.
 */

export const colors = {
  // Brand
  primary: '#0E7C66',
  primaryDark: '#0A5F4F',
  primarySoft: '#E3F2EE',
  accent: '#F59E0B',
  accentSoft: '#FEF3E2',

  // Surfaces
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F4',

  // Text
  text: '#101828',
  textSecondary: '#475467',
  textTertiary: '#98A2B3',
  textOnPrimary: '#FFFFFF',

  // Status (always paired with text labels)
  success: '#12805C',
  successSoft: '#E6F6EE',
  warning: '#B54708',
  warningSoft: '#FEF0E0',
  error: '#D92D20',
  errorSoft: '#FDECEA',
  info: '#175CD3',
  infoSoft: '#EAF1FD',

  // Borders & misc
  border: '#E4E7EC',
  borderStrong: '#D0D5DD',
  overlay: 'rgba(16, 24, 40, 0.5)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  h1: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
} as const;

export const shadows = {
  card: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

/** Minimum touch target (accessibility). */
export const TOUCH_TARGET = 44;
