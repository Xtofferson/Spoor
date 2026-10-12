import { Linking, Share } from 'react-native';

import type { Translate } from '@/lib/i18n';
import type { TripPlan } from '@/lib/trip-plan';
import { formatDate, formatDateRange } from '@/lib/trips';

/** The plan as a message for the group: dates, stops and where to fill up. */
export function tripShareText(plan: Pick<TripPlan, 'trip' | 'route' | 'plannedFuelStops'>, t: Translate, locale?: string) {
  const { trip, route, plannedFuelStops } = plan;
  const lines = [trip.name];
  lines.push(trip.endDate ? formatDateRange(trip.startDate, trip.endDate, locale) : formatDate(trip.startDate, locale));
  if (route) lines.push(`${Math.round(route.distance / 1000).toLocaleString('en-US')} km`);
  lines.push('');
  trip.stops.forEach((stop) => {
    const date = stop.arriveDate ?? stop.departDate;
    lines.push(date ? `• ${stop.name} (${formatDate(date, locale)})` : `• ${stop.name}`);
  });
  if (plannedFuelStops.length > 0) {
    lines.push('', t('friends.fuelAt', { places: plannedFuelStops.map((stop) => stop.label).join(', ') }));
  }
  lines.push('', t('friends.plannedWith'));
  return lines.join('\n');
}

/** Opens WhatsApp with the message ready to send; without WhatsApp, the phone's share sheet. */
export async function shareOnWhatsApp(message: string) {
  try {
    await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
  } catch {
    await Share.share({ message });
  }
}

/** The phone's share sheet (WhatsApp, Messages, email…). */
export function shareAnyWay(message: string) {
  return Share.share({ message });
}
