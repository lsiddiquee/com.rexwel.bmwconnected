import type { ConnectionState } from '../lib/streaming/IMqttClient';

/**
 * Values of the `cardata_stream_state` capability.
 *
 * Describes the health of the real-time MQTT stream from the user's point of view.
 */
export const StreamState = {
  /** The stream is connected and delivering data. */
  CONNECTED: 'connected',
  /** The first connection attempt is in progress. */
  CONNECTING: 'connecting',
  /** The stream is down and the app is recovering (client reconnect or scheduled retry). */
  RECONNECTING: 'reconnecting',
  /** Streaming is turned off in the device settings. */
  DISABLED: 'disabled',
  /** Streaming is enabled but cannot be started at all (e.g. no auth provider / API client). */
  UNAVAILABLE: 'unavailable',
} as const;

export type StreamState = (typeof StreamState)[keyof typeof StreamState];

/**
 * English titles of each stream state, as shown in the capability and used as the `state`
 * token of the "Car data stream changed" flow trigger.
 * Must stay in sync with the values in `.homeycompose/capabilities/cardata_stream_state.json`.
 */
export const STREAM_STATE_TITLES: Record<StreamState, string> = {
  [StreamState.CONNECTED]: 'Live',
  [StreamState.CONNECTING]: 'Connecting',
  [StreamState.RECONNECTING]: 'Reconnecting',
  [StreamState.DISABLED]: 'Off',
  [StreamState.UNAVAILABLE]: 'Unavailable',
};

/**
 * Type guard for stream state values (e.g. when reading the capability value back).
 *
 * @param value - Any value
 * @returns True when the value is one of the known stream states
 */
export function isStreamState(value: unknown): value is StreamState {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(STREAM_STATE_TITLES, value)
  );
}

/**
 * Context needed to translate an MQTT client connection state into a stream state.
 */
export interface StreamStateContext {
  /** Whether the user has streaming enabled in the device settings. */
  streamingEnabled: boolean;
  /**
   * Whether the app is recovering from a failed start: a retry is scheduled, or at least
   * one start attempt has failed since the last successful start.
   */
  recovering: boolean;
}

/**
 * Translate an MQTT client connection state into the user-facing stream state.
 *
 * - `connected` -> connected
 * - `connecting` -> connecting, or reconnecting while retrying a failed start (avoids
 *   flipping between "reconnecting" and "connecting" on every retry)
 * - `reconnecting` -> reconnecting
 * - `error` -> reconnecting (a failed start always leads to a scheduled retry)
 * - `disconnected` -> disabled when the user turned streaming off; reconnecting while a retry
 *   is pending; otherwise unavailable (nothing is going to bring the stream back)
 *
 * @param state - Connection state reported by the MQTT client
 * @param context - Streaming settings and retry situation
 * @returns The stream state to show
 */
export function mapConnectionState(
  state: ConnectionState,
  context: StreamStateContext
): StreamState {
  switch (state) {
    case 'connected':
      return StreamState.CONNECTED;
    case 'connecting':
      return context.recovering ? StreamState.RECONNECTING : StreamState.CONNECTING;
    case 'reconnecting':
      return StreamState.RECONNECTING;
    case 'error':
      return context.streamingEnabled ? StreamState.RECONNECTING : StreamState.DISABLED;
    case 'disconnected':
      if (!context.streamingEnabled) {
        return StreamState.DISABLED;
      }
      return context.recovering ? StreamState.RECONNECTING : StreamState.UNAVAILABLE;
  }
}
