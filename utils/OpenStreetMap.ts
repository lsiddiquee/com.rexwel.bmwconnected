import fetch from 'cross-fetch';
import { ILogger } from '../lib';

export class OpenStreetMap {
  static async GetAddress(
    latitude: number,
    longitude: number,
    logger?: ILogger
  ): Promise<string | undefined> {
    logger?.info(`Resolving address for Latitude: ${latitude} Longitude: ${longitude}`);
    const url: string = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=0`;

    const serverResponse = await fetch(url, {
      headers: {
        'User-Agent': 'HomeyAppBMWConnected',
      },
    });

    const response = await serverResponse.text();

    if (!serverResponse.ok) {
      logger?.error(
        `${serverResponse.status}: Error occurred while attempting to retrieve address. Server response: ${response}`
      );
      return undefined;
    }

    try {
      const parsedResponse: unknown = JSON.parse(response);

      if (
        typeof parsedResponse === 'object' &&
        parsedResponse !== null &&
        'display_name' in parsedResponse
      ) {
        const address = (parsedResponse as { display_name: string }).display_name;
        logger?.info(`Resolved address: ${address}`);
        return address;
      } else {
        logger?.error('Invalid response format: missing display_name property');
        return undefined;
      }
    } catch (error) {
      logger?.error(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }
}
