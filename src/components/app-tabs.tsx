import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BorderWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type Tab = { name: string; href: '/trips' | '/community' | '/maps' | '/me'; label: string; icon: SymbolViewProps['name'] };

/**
 * The bottom tab bar from the mockups: Trips, Community, Maps and Me on a cream bar with a
 * dark-brown line on top; the open tab in burnt orange. It stays visible inside a trip.
 * Home, first, goes back to the landing page.
 */
export default function AppTabs() {
  const t = useT();
  const tabs: Tab[] = [
    { name: 'trips', href: '/trips', label: t('tabs.trips'), icon: { ios: 'safari', android: 'explore', web: 'explore' } },
    {
      name: 'community',
      href: '/community',
      label: t('tabs.community'),
      icon: { ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' },
    },
    { name: 'maps', href: '/maps', label: t('tabs.maps'), icon: { ios: 'map', android: 'map', web: 'map' } },
    { name: 'me', href: '/me', label: t('tabs.me'), icon: { ios: 'person', android: 'person_outline', web: 'person_outline' } },
  ];

  return (
    <Tabs style={styles.flex}>
      <TabSlot style={styles.flex} />
      <TabList asChild>
        <TabBar>
          <HomeButton label={t('tabs.home')} />
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton tab={tab}>{tab.label}</TabButton>
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}

function TabBar(props: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, Spacing.two),
        },
      ]}
    />
  );
}

/** Back to the landing page, beside the tabs and styled like them. */
function HomeButton({ label }: { label: string }) {
  const theme = useTheme();
  const color = theme.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.dismissTo('/')}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <SymbolView
        name={{ ios: 'house', android: 'home', web: 'home' }}
        size={26}
        tintColor={color}
        weight="regular"
      />
      <ThemedText style={[styles.label, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

function TabButton({ children, isFocused, tab, onPress, ...props }: TabTriggerSlotProps & { tab: Tab }) {
  const theme = useTheme();
  const color = isFocused ? theme.accent : theme.textSecondary;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      onPress={(event) => {
        // Tapping Trips again goes back to the list from inside a trip.
        if (isFocused && tab.name === 'trips') router.dismissTo('/trips');
        else onPress?.(event);
      }}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <SymbolView name={tab.icon} size={26} tintColor={color} weight={isFocused ? 'semibold' : 'regular'} />
      <ThemedText style={[styles.label, { color }, isFocused && styles.labelFocused]}>{children}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    borderTopWidth: BorderWidth,
    paddingTop: 6,
    paddingHorizontal: Spacing.one,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 52,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: 500,
  },
  labelFocused: {
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.7,
  },
});
