/**
 * Manual mock for Homey SDK
 * Used by tests to avoid requiring the actual Homey runtime
 */

/**
 * Timer functions of the Homey manager (`this.homey.setTimeout` etc.).
 *
 * The real ones are aliases of the global timers that also dispose the timers when the app stops,
 * so the mock simply delegates to the global functions. The global is looked up on every call, so
 * timers installed by `jest.useFakeTimers()` after the mock was created are driven by fake time.
 *
 * @returns Object with `setTimeout`, `clearTimeout`, `setInterval` and `clearInterval`
 */
export function createHomeyTimers() {
  return {
    setTimeout: (callback: (...args: any[]) => void, ms?: number, ...args: any[]) =>
      setTimeout(callback, ms, ...args),
    clearTimeout: (timeoutId: any) => clearTimeout(timeoutId),
    setInterval: (callback: (...args: any[]) => void, ms?: number, ...args: any[]) =>
      setInterval(callback, ms, ...args),
    clearInterval: (intervalId: any) => clearInterval(intervalId),
  };
}

export class Device {
  homey: any;
  data: any;

  constructor() {
    this.homey = { ...createHomeyTimers() };
    this.data = {};
  }

  getData() {
    return this.data;
  }

  getName() {
    return 'Mock Device';
  }

  getStoreValue(_key: string): any {
    return undefined;
  }

  setStoreValue(_key: string, _value: any): Promise<void> {
    return Promise.resolve();
  }

  getSettings(): any {
    return {};
  }

  setSettings(_settings: any): Promise<void> {
    return Promise.resolve();
  }

  hasCapability(_capabilityId: string): boolean {
    return false;
  }

  addCapability(_capabilityId: string): Promise<void> {
    return Promise.resolve();
  }

  removeCapability(_capabilityId: string): Promise<void> {
    return Promise.resolve();
  }

  setCapabilityValue(_capabilityId: string, _value: any): Promise<void> {
    return Promise.resolve();
  }

  getCapabilityValue(_capabilityId: string): any {
    return undefined;
  }

  setCapabilityOptions(_capabilityId: string, _options: any): Promise<void> {
    return Promise.resolve();
  }

  registerCapabilityListener(_capabilityId: string, _listener: Function): void {
    // Mock implementation
  }

  log(..._args: any[]): void {
    // Silent mock
  }

  error(..._args: any[]): void {
    // Silent mock
  }
}

export class App {
  homey: any;

  constructor() {
    this.homey = { ...createHomeyTimers() };
  }

  log(..._args: any[]): void {
    // Silent mock
  }

  error(..._args: any[]): void {
    // Silent mock
  }
}

export class Driver {
  homey: any;

  constructor() {
    this.homey = { ...createHomeyTimers() };
  }

  log(..._args: any[]): void {
    // Silent mock
  }

  error(..._args: any[]): void {
    // Silent mock
  }
}
