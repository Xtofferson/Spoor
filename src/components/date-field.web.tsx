import { createElement } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderWidth, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date, as `YYYY-MM-DD`. */
  minimumDate?: string;
  /** Latest selectable date, as `YYYY-MM-DD`. */
  maximumDate?: string;
};

/** The @expo/ui picker renders nothing on web, so use the browser's native date input. */
export function DateField({ label, value, onChange, minimumDate, maximumDate }: DateFieldProps) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={[styles.field, { borderColor: theme.border }]}>
      <ThemedText>{label}</ThemedText>
      {createElement('input', {
        type: 'date',
        value,
        min: minimumDate,
        max: maximumDate,
        'aria-label': label,
        required: true,
        onChange: (event: { target: { value: string } }) => {
          if (event.target.value) onChange(event.target.value);
        },
        style: {
          fontFamily: Fonts.sans,
          fontSize: 16,
          color: theme.link,
          backgroundColor: 'transparent',
          accentColor: theme.accent,
          border: 'none',
        },
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 52,
    borderWidth: BorderWidth,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
