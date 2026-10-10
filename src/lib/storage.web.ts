/**
 * Web uses the browser's localStorage, which avoids the extra wasm and header setup
 * that expo-sqlite needs on web. Access is guarded for static rendering and private windows.
 */
export const storage = {
  getItem(key: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable; the in-memory copy still works for this session.
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove if storage is unavailable.
    }
  },
};
