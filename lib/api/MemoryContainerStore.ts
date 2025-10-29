/**
 * Memory-based Container Store
 *
 * Simple in-memory implementation of IContainerStore for testing
 * and non-persistent storage scenarios.
 */

import type { IContainerStore } from './ContainerManager';

/**
 * MemoryContainerStore - In-memory container ID storage
 *
 * Stores container IDs in memory. Data is lost when application restarts.
 * For production use, implement IContainerStore with persistent storage
 * (e.g., Homey device settings, database, file system).
 *
 * @example
 * const store = new MemoryContainerStore();
 * await store.setContainerId('WBY31AW090FP15359', 'container-123');
 * const id = await store.getContainerId('WBY31AW090FP15359');
 */
export class MemoryContainerStore implements IContainerStore {
  private readonly storage: Map<string, string> = new Map();

  /**
   * Retrieve stored container ID for a VIN
   *
   * @param vin - Vehicle Identification Number
   * @returns Container ID or null if not found
   */
  async getContainerId(vin: string): Promise<string | null> {
    return Promise.resolve(this.storage.get(vin) ?? null);
  }

  /**
   * Store container ID for a VIN
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - Container identifier
   */
  async setContainerId(vin: string, containerId: string): Promise<void> {
    this.storage.set(vin, containerId);
    return Promise.resolve();
  }

  /**
   * Remove stored container ID for a VIN
   *
   * @param vin - Vehicle Identification Number
   */
  async deleteContainerId(vin: string): Promise<void> {
    this.storage.delete(vin);
    return Promise.resolve();
  }

  /**
   * Check if container ID exists for a VIN
   *
   * @param vin - Vehicle Identification Number
   * @returns True if container ID exists
   */
  async hasContainerId(vin: string): Promise<boolean> {
    return Promise.resolve(this.storage.has(vin));
  }

  /**
   * Get all stored VINs
   *
   * @returns Array of VINs
   */
  getAllVins(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Clear all stored container IDs
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get number of stored container IDs
   *
   * @returns Count of stored containers
   */
  size(): number {
    return this.storage.size;
  }
}
