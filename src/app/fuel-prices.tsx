import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Field, TextButton } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { COUNTRIES, type CountryCode } from '@/lib/countries';
import {
  ESTIMATED_PRICES,
  ESTIMATES_DATE,
  FALLBACK_COUNTRY,
  setOwnFuelPrice,
  useOwnFuelPrices,
  type FuelType,
} from '@/lib/fuel-prices';
import { dateLocale, useLanguage, useT } from '@/lib/i18n';
import { fromDateString } from '@/lib/trips';
import { useVehicle } from '@/lib/vehicle';

/** A price as typed: blank clears it, and a decimal comma is fine. Undefined if it isn't a price. */
function readPrice(text: string): number | null | undefined {
  const trimmed = text.trim().replace(',', '.').replace(/^R\s*/i, '');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 && value < 500 ? value : undefined;
}

/**
 * Fuel prices per country, in Rand per litre, for the fuel budget. Starts from estimates;
 * what someone types replaces the estimate on this phone.
 */
export default function FuelPricesScreen() {
  const theme = useTheme();
  const t = useT();
  const locale = dateLocale(useLanguage());
  const own = useOwnFuelPrices();
  const vehicle = useVehicle();
  const fuel: FuelType = vehicle?.fuelType ?? 'diesel';
  const other: FuelType = fuel === 'diesel' ? 'petrol' : 'diesel';
  const date = fromDateString(ESTIMATES_DATE).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const hasOwn = COUNTRIES.some((code) => own[code]?.diesel || own[code]?.petrol);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText themeColor="textSecondary">{t('fuelPrices.intro', { date })}</ThemedText>
        {COUNTRIES.map((code) => (
          <Card key={code}>
            <ThemedText type="heading">{t(`countries.${code}`)}</ThemedText>
            <View style={styles.fields}>
              {[fuel, other].map((type) => (
                <PriceField key={type} country={code} fuel={type} own={own[code]?.[type]} />
              ))}
            </View>
          </Card>
        ))}
        {hasOwn && (
          <View style={styles.center}>
            <TextButton
              label={t('fuelPrices.reset')}
              onPress={() =>
                COUNTRIES.forEach((code) => {
                  setOwnFuelPrice(code, 'diesel', undefined);
                  setOwnFuelPrice(code, 'petrol', undefined);
                })
              }
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PriceField({ country, fuel, own }: { country: CountryCode; fuel: FuelType; own?: number }) {
  const t = useT();
  const [text, setText] = useState(own !== undefined ? own.toFixed(2) : '');
  const [error, setError] = useState<string | undefined>();
  const estimate = ESTIMATED_PRICES[country]?.[fuel];
  const fallback = ESTIMATED_PRICES[FALLBACK_COUNTRY]![fuel]!;

  function save() {
    const price = readPrice(text);
    if (price === undefined) {
      setError(t('fuelPrices.error'));
      return;
    }
    setError(undefined);
    setOwnFuelPrice(country, fuel, price ?? undefined);
    setText(price === null ? '' : price.toFixed(2));
  }

  return (
    <View style={styles.flex}>
      <Field
        label={t(`fuel.types.${fuel}`)}
        value={text}
        onChangeText={setText}
        onEndEditing={save}
        onSubmitEditing={save}
        placeholder={estimate !== undefined ? estimate.toFixed(2) : `${fallback.toFixed(2)}*`}
        keyboardType="decimal-pad"
        returnKeyType="done"
        error={error}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {estimate !== undefined ? t('fuelPrices.estimate', { price: estimate.toFixed(2) }) : t('fuelPrices.noEstimate')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: Spacing.one,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  fields: {
    flexDirection: 'row',
    gap: 12,
  },
  center: {
    alignItems: 'center',
  },
});
