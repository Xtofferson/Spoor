import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, fromDateString, toDateString } from '@/lib/trips';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export function DateField({ value, onChange }: DateFieldProps) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <ThemedView type="backgroundElement" style={[styles.field, styles.iosField]}>
        {/* Full-width row so the native picker isn't measured to zero width and becomes untappable. */}
        <Host matchContents={{ vertical: true }} style={styles.iosHost}>
          <DatePicker
            title="Start date"
            selection={fromDateString(value)}
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
        accessibilityLabel={`Start date, ${formatDate(value)}`}
        onPress={() => setDialogOpen(true)}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.field}>
          <ThemedText>{formatDate(value)}</ThemedText>
        </ThemedView>
      </Pressable>
      {dialogOpen && (
        <DateTimePicker
          value={fromDateString(value)}
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

const styles = StyleSheet.create({
  field: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  iosField: {
    paddingVertical: Spacing.one,
  },
  iosHost: {
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
});
