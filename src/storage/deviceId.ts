export interface DeviceIdStorage {
  get(): string | null;
  set(id: string): void;
}

// Web 환경 (현재 기본)
export class WebDeviceIdStorage implements DeviceIdStorage {
  get(): string | null {
    return localStorage.getItem('device_id');
  }
  set(id: string): void {
    localStorage.setItem('device_id', id);
  }
}

// Capacitor 환경 (앱 배포 시 교체)
// import { Preferences } from '@capacitor/preferences';
// export class CapacitorDeviceIdStorage implements DeviceIdStorage {
//   get() { /* Preferences.get({ key: 'device_id' }) */ return null; }
//   set(id: string) { /* Preferences.set({ key: 'device_id', value: id }) */ }
// }

const defaultStorage = new WebDeviceIdStorage();

export function getDeviceId(storage: DeviceIdStorage = defaultStorage): string {
  let id = storage.get();
  if (!id) {
    id = crypto.randomUUID();
    storage.set(id);
  }
  return id;
}
