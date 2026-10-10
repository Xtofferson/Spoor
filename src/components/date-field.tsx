import { DateTimePicker } from '@expo/ui/community/datetime-picker';
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
        <DateTimePicker
          value={fromDateString(value)}
          onValueChange={(_, date) => onChange(toDateString(date))}
          display="compact"
          accentColor={theme.accent}
        />
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
    alignItems: 'flex-start',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
