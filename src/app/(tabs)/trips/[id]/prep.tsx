import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TripTabScreen } from '@/components/trip-tab';
import { Button, Card, IconButton, Input } from '@/components/ui';
import { BorderWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { addPrepItem, removePrepItem, STANDARD_PREP, togglePrepItem, usePrepList } from '@/lib/prep';
import { useTripPlan } from '@/lib/trip-plan';
import { createId, tripDays } from '@/lib/trips';
import { WATER_PER_PERSON_PER_DAY } from '@/lib/water';

/** The trip's Prep tab, as in the mockup: a checklist to tick off before leaving. */
export default function PrepTab() {
  const t = useT();
  const { trip, people } = useTripPlan();
  const list = usePrepList(trip.id);
  const [newItem, setNewItem] = useState('');
  // Enough water for the whole trip, as a starting point.
  const days = trip.endDate ? tripDays(trip.startDate, trip.endDate) : 1;
  const litres = days * people * WATER_PER_PERSON_PER_DAY;

  const items = [
    ...STANDARD_PREP.map((id) => ({
      id,
      label: id === 'water' ? t('prep.items.water', { litres }) : t(`prep.items.${id}`),
      own: false,
    })),
    ...list.own.map((item) => ({ ...item, own: true })),
  ];
  const doneCount = items.filter((item) => list.done.includes(item.id)).length;

  function add() {
    const label = newItem.trim();
    if (!label) return;
    addPrepItem(trip.id, label, createId());
    setNewItem('');
  }

  return (
    <TripTabScreen>
      <ThemedText themeColor="textSecondary">{t('prep.progress', { done: doneCount, total: items.length })}</ThemedText>
      <Card style={styles.list}>
        {items.map((item, index) => (
          <CheckRow
            key={item.id}
            label={item.label}
            checked={list.done.includes(item.id)}
            divider={index > 0}
            onToggle={() => togglePrepItem(trip.id, item.id)}
            onRemove={item.own ? () => removePrepItem(trip.id, item.id) : undefined}
          />
        ))}
      </Card>

      <View style={styles.addRow}>
        <Input
          value={newItem}
          onChangeText={setNewItem}
          placeholder={t('prep.addPlaceholder')}
          accessibilityLabel={t('prep.addLabel')}
          returnKeyType="done"
          onSubmitEditing={add}
          style={styles.flex}
        />
        <Button compact label={t('prep.add')} onPress={add} disabled={!newItem.trim()} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('prep.savedHere')}
      </ThemedText>
    </TripTabScreen>
  );
}

function CheckRow({
  label,
  checked,
  divider,
  onToggle,
  onRemove,
}: {
  label: string;
  checked: boolean;
  divider: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSoft }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
        <View
          style={[
            styles.box,
            { borderColor: theme.border, backgroundColor: checked ? theme.olive : theme.background },
          ]}>
          {checked && <ThemedText style={[styles.tick, { color: theme.onAccent }]}>✓</ThemedText>}
        </View>
        <ThemedText style={[styles.flex, checked && { color: theme.textSecondary }]}>{label}</ThemedText>
      </Pressable>
      {onRemove && (
        <IconButton
          icon={{ ios: 'xmark', android: 'close', web: 'close' }}
          label={t('prep.remove', { item: label })}
          onPress={onRemove}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    gap: 0,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  check: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: 600,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
