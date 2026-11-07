import {
  isStreamState,
  mapConnectionState,
  STREAM_STATE_TITLES,
  StreamState,
} from '../../utils/StreamState';

describe('StreamState', () => {
  describe('mapConnectionState', () => {
    const enabled = { streamingEnabled: true, recovering: false };
    const enabledRecovering = { streamingEnabled: true, recovering: true };
    const disabled = { streamingEnabled: false, recovering: false };

    it('should_mapConnectedToConnected', () => {
      expect(mapConnectionState('connected', enabled)).toBe(StreamState.CONNECTED);
      expect(mapConnectionState('connected', enabledRecovering)).toBe(StreamState.CONNECTED);
    });

    it('should_mapConnectingToConnecting_when_firstAttempt', () => {
      expect(mapConnectionState('connecting', enabled)).toBe(StreamState.CONNECTING);
    });

    it('should_mapConnectingToReconnecting_when_retryingAfterFailure', () => {
      expect(mapConnectionState('connecting', enabledRecovering)).toBe(StreamState.RECONNECTING);
    });

    it('should_mapReconnectingToReconnecting', () => {
      expect(mapConnectionState('reconnecting', enabled)).toBe(StreamState.RECONNECTING);
    });

    it('should_mapErrorToReconnecting_when_streamingEnabled', () => {
      expect(mapConnectionState('error', enabled)).toBe(StreamState.RECONNECTING);
      expect(mapConnectionState('error', enabledRecovering)).toBe(StreamState.RECONNECTING);
    });

    it('should_mapErrorToDisabled_when_streamingTurnedOff', () => {
      expect(mapConnectionState('error', disabled)).toBe(StreamState.DISABLED);
    });

    it('should_mapDisconnectedToDisabled_when_userTurnedStreamingOff', () => {
      expect(mapConnectionState('disconnected', disabled)).toBe(StreamState.DISABLED);
    });

    it('should_mapDisconnectedToReconnecting_when_retryPending', () => {
      expect(mapConnectionState('disconnected', enabledRecovering)).toBe(StreamState.RECONNECTING);
    });

    it('should_mapDisconnectedToUnavailable_when_enabledAndNothingWillRetry', () => {
      expect(mapConnectionState('disconnected', enabled)).toBe(StreamState.UNAVAILABLE);
    });
  });

  describe('isStreamState', () => {
    it('should_acceptAllKnownStates', () => {
      for (const state of Object.values(StreamState)) {
        expect(isStreamState(state)).toBe(true);
      }
    });

    it('should_rejectUnknownValues', () => {
      expect(isStreamState('nope')).toBe(false);
      expect(isStreamState(undefined)).toBe(false);
      expect(isStreamState(null)).toBe(false);
      expect(isStreamState(100)).toBe(false);
      expect(isStreamState('toString')).toBe(false);
    });
  });

  describe('STREAM_STATE_TITLES', () => {
    it('should_useTheEnglishCapabilityTitles', () => {
      expect(STREAM_STATE_TITLES).toEqual({
        connected: 'Live',
        connecting: 'Connecting',
        reconnecting: 'Reconnecting',
        disabled: 'Off',
        unavailable: 'Unavailable',
      });
    });
  });
});
