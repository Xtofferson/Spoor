import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BorderWidth, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The v2 mockups' building blocks: rust buttons, cream cards and fields with 2 px dark-brown
 * outlines and 14 px corners. Every button is at least 44 pt tall, so it's easy to hit.
 */

/** The smallest a button may be, in both directions. */
export const MIN_TOUCH = 44;

type ButtonVariant = 'primary' | 'outline' | 'danger' | 'whatsapp';

/**
 * A button. "primary" is rust with white text, "outline" cream with a dark outline,
 * "danger" a red outline, "whatsapp" green. `compact` is 44 pt tall instead of 52.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
  compact,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: SymbolViewProps['name'];
  disabled?: boolean;
  /** Shows a spinner instead of the label, and can't be pressed. */
  busy?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [background, border, color] = {
    primary: [theme.accent, theme.accent, theme.onAccent],
    outline: [theme.backgroundElement, theme.border, theme.text],
    danger: [theme.backgroundElement, theme.danger, theme.danger],
    whatsapp: [theme.whatsapp, theme.whatsapp, theme.onAccent],
  }[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: background, borderColor: border },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon && <SymbolView name={icon} size={20} weight="semibold" tintColor={color} />}
          <ThemedText style={[compact ? styles.compactLabel : styles.label, { color }]}>{label}</ThemedText>
        </>
      )}
    </Pressable>
  );
}

/** A button that looks like a link, e.g. "Refresh" or "Move pin", still 44 pt tall to hit. */
export function TextButton({
  label,
  onPress,
  accessibilityLabel,
  tone = 'link',
  disabled,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  tone?: 'link' | 'danger';
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <ThemedText style={[styles.textButtonLabel, { color: tone === 'danger' ? theme.danger : theme.link }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A square button with only an icon, e.g. move a stop up. `outlined` gives it the cream box. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  outlined,
}: {
  icon: SymbolViewProps['name'];
  /** What it does, for screen readers. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  outlined?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        outlined && [styles.outlined, { backgroundColor: theme.backgroundElement, borderColor: theme.border }],
        disabled && styles.faint,
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={icon}
        size={outlined ? 20 : 18}
        weight="semibold"
        tintColor={outlined ? theme.text : theme.textSecondary}
      />
    </Pressable>
  );
}

/** A cream card. `outlined` adds the dark 2 px outline, for things that stand out. */
export function Card({
  children,
  outlined,
  style,
}: {
  children: ReactNode;
  outlined?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement },
        outlined && { borderWidth: BorderWidth, borderColor: theme.border },
        style,
      ]}>
      {children}
    </View>
  );
}

/** A text field: cream, outlined in dark brown (red when something's wrong). */
export function Input({ invalid, style, ...props }: TextInputProps & { invalid?: boolean }) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        props.multiline && styles.multiline,
        {
          color: theme.text,
          backgroundColor: theme.backgroundElement,
          borderColor: invalid ? theme.danger : theme.border,
        },
        style,
      ]}
    />
  );
}

/**
 * A labelled text field, with an optional unit inside it (e.g. "L") and a message under it
 * when something's wrong. Numbers are shown in the mono font.
 */
export function Field({
  label,
  error,
  unit,
  ...props
}: TextInputProps & { label: string; error?: string; unit?: string }) {
  const theme = useTheme();
  const numeric = props.keyboardType !== undefined && props.keyboardType !== 'default';
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View>
        <Input
          {...props}
          invalid={!!error}
          accessibilityLabel={unit ? `${label}, ${unit}` : label}
          style={[numeric && styles.mono, unit ? styles.withUnit : undefined]}
        />
        {unit && (
          <View style={styles.unit} pointerEvents="none">
            <ThemedText themeColor="textSecondary">{unit}</ThemedText>
          </View>
        )}
      </View>
      {error && (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </View>
  );
}

/** The small label above a field or a group of choices. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

/** A pill to pick one of a few things, e.g. a terrain or a kind of place: dark when chosen. */
export function Chip({
  label,
  selected,
  onPress,
  role = 'radio',
  color,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** "switch" for chips that turn something on or off, like map layers. */
  role?: 'radio' | 'switch' | 'button';
  /** The chosen chip's colour, e.g. a kind of place's own colour. Dark brown by default. */
  color?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const on = color ?? theme.text;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'button' ? { selected } : { checked: selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: on, borderColor: on }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.borderSoft },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={[styles.chipLabel, { color: selected ? (color ? '#FFFFFF' : theme.backgroundElement) : theme.text }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** The bar at the bottom of a form, e.g. Cancel and Save, above the home indicator. */
/**
 * A number with − and + buttons, e.g. the people on a trip. Screen readers can swipe up and
 * down to change it.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const change = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  return (
    <View
      style={styles.stepper}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, min, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => change(event.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <StepButton label="−" accessibilityLabel={decreaseLabel} disabled={value <= min} onPress={() => change(-1)} />
      <ThemedText style={styles.stepperValue}>{value}</ThemedText>
      <StepButton label="+" accessibilityLabel={increaseLabel} disabled={value >= max} onPress={() => change(1)} />
    </View>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        { borderColor: theme.border, backgroundColor: theme.background },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <ThemedText style={styles.stepLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.actionBar,
        {
          paddingBottom: insets.bottom + Spacing.three,
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
        },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: 18,
    borderWidth: BorderWidth,
    borderRadius: Radius.card,
  },
  compact: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
    textAlign: 'center',
  },
  compactLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
    textAlign: 'center',
  },
  textButton: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  textButtonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
    textDecorationLine: 'underline',
  },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlined: {
    width: 48,
    height: 48,
    borderWidth: BorderWidth,
    borderRadius: Radius.card,
  },
  card: {
    gap: 12,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    fontSize: 17,
    borderWidth: BorderWidth,
    borderRadius: Radius.card,
  },
  multiline: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  withUnit: {
    paddingRight: 96,
  },
  unit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.three,
    justifyContent: 'center',
  },
  field: {
    gap: 6,
  },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: BorderWidth,
    borderRadius: Radius.pill,
  },
  chipLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: 600,
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 600,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: BorderWidth,
  },
  disabled: {
    opacity: 0.45,
  },
  faint: {
    opacity: 0.3,
  },
  pressed: {
    opacity: 0.7,
  },
});
