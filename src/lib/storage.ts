import Storage from 'expo-sqlite/kv-store';

/** Synchronous key-value storage that persists on the device. */
export const storage = {
  getItem(key: string): string | null {
    return Storage.getItemSync(key);
  },
  setItem(key: string, value: string) {
    Storage.setItemSync(key, value);
  },
  removeItem(key: string) {
    Storage.removeItemSync(key);
  },
  /** Every key saved, e.g. to clean up old entries. */
  keys(): string[] {
    return Storage.getAllKeysSync();
  },
};
