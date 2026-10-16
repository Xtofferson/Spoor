import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale, useLanguage } from '@/lib/i18n';
import { formatDate, fromDateString, toDateString } from '@/lib/trips';

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date, as `YYYY-MM-DD`. */
  minimumDate?: string;
  /** Latest selectable date, as `YYYY-MM-DD`. */
  maximumDate?: string;
};

export function DateField({ label, value, onChange, minimumDate, maximumDate }: DateFieldProps) {
  const locale = dateLocale(useLanguage());
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  // iOS: the picker sits on the box's top edge until it's updated once, so update it as soon
  // as it has laid out (choosing a date did the same before).
  const [, setLaidOut] = useState(false);
  const minimum = minimumDate ? fromDateString(minimumDate) : undefined;
  const maximum = maximumDate ? fromDateString(maximumDate) : undefined;

  if (Platform.OS === 'ios') {
    return (
      <ThemedView type="backgroundElement" style={[styles.field, styles.iosField, { borderColor: theme.border }]}>
        {/*
          A fixed, full-width frame: measured to zero width the picker is untappable, and sized
          to its contents it sits on the box's top edge instead of in the middle.
        */}
        <Host style={styles.iosHost} onLayoutContent={() => setLaidOut(true)}>
          <DatePicker
            title={label}
            selection={fromDateString(value)}
            range={minimum || maximum ? { start: minimum, end: maximum } : undefined}
            displayedComponents={['date']}
            onDateChange={(date) => onChange(toDateString(date))}
            modifiers={[datePickerStyle('compact'), tint(theme.accent)]}
          />
        </Host>
      </ThemedView>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatDate(value, locale)}`}
        onPress={() => setDialogOpen(true)}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={[styles.field, styles.androidField, { borderColor: theme.border }]}>
          <ThemedText>{label}</ThemedText>
          <ThemedText style={{ color: theme.link, fontWeight: 600 }}>{formatDate(value, locale)}</ThemedText>
        </ThemedView>
      </Pressable>
      {dialogOpen && (
        <DateTimePicker
          value={fromDateString(value)}
          minimumDate={minimum}
          maximumDate={maximum}
          onValueChange={(_, date) => {
            setDialogOpen(false);
            onChange(toDateString(date));
          }}
          onDismiss={() => setDialogOpen(false)}
          accentColor={theme.accent}
        />
      )}
    </>
  );
}

/** The compact picker's height: with the box's padding, the same 52 pt as a text field. */
const IOS_PICKER_HEIGHT = 44;

const styles = StyleSheet.create({
  field: {
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: BorderWidth,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  iosField: {
    paddingVertical: Spacing.one,
  },
  iosHost: {
    width: '100%',
    height: IOS_PICKER_HEIGHT,
  },
  androidField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
