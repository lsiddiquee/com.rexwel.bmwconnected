/**
 * Manual mock for Homey SDK
 * Used by tests to avoid requiring the actual Homey runtime
 */

export class Device {
  homey: any;
  data: any;

  constructor() {
    this.homey = {};
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
    this.homey = {};
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
    this.homey = {};
  }

  log(..._args: any[]): void {
    // Silent mock
  }

  error(..._args: any[]): void {
    // Silent mock
  }
}
