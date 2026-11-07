import type { Driver } from 'homey';
import type { BMWConnectedDrive } from '../../app';
import type { BatteryWidgetState } from '../../utils/BatteryWidgetState';

type Homey = Driver['homey'];

// Each route must be a named export. Homey requires the compiled CommonJS file and calls
// module.exports[routeName]; a default export would end up under module.exports.default, where
// Homey does not look (the CLI's `export default` template is for ES module apps only).

/**
 * The state of the "Car battery" widget: the battery level, charging state and range of the car
 * picked in the widget settings.
 *
 * @param query.deviceId - The data id of the car. The first car is used when it is missing or unknown
 * @returns The state, null when the app has no cars
 */
export async function getState({
  homey,
  query,
}: {
  homey: Homey;
  query: { deviceId?: string };
}): Promise<{ state: BatteryWidgetState | null }> {
  await Promise.resolve(); // Ensure async context

  return { state: (homey.app as BMWConnectedDrive).getBatteryWidgetState(query.deviceId) };
}
