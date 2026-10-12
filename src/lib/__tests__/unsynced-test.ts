import { translate, type Translate } from '../i18n';
import { hasUnsynced, unsyncedLines } from '../unsynced';

jest.mock('@/lib/supplies', () => ({ pendingPointCount: () => 0, syncSupplyPoints: async () => {} }));
jest.mock('@/lib/trip-sync', () => ({ syncTrips: async () => {} }));
jest.mock('@/lib/trips', () => ({ getTripsFor: () => [] }));
jest.mock('@/lib/vehicle', () => ({ syncVehicle: async () => {}, vehicleNeedsUpload: () => false }));

const en: Translate = (key, options) => translate('en', key, options);

describe('unsynced changes', () => {
  it('lists each kind of change waiting to upload', () => {
    expect(unsyncedLines({ trips: 2, vehicle: true, places: 1 }, en)).toBe('• 2 trips\n• Your vehicle\n• 1 place you added');
    expect(unsyncedLines({ trips: 1, vehicle: false, places: 0 }, en)).toBe('• 1 trip');
  });

  it('knows when everything has uploaded', () => {
    expect(hasUnsynced({ trips: 0, vehicle: false, places: 0 })).toBe(false);
    expect(hasUnsynced({ trips: 0, vehicle: false, places: 3 })).toBe(true);
  });
});
