# BMW CarData MQTT Streaming

## Overview

BMW CarData API provides real-time vehicle data streaming via MQTT (Message Queuing Telemetry Transport) protocol. This streaming service enables applications to receive live telematic updates without polling the REST API, avoiding the strict 50 requests/24h rate limit.

## Connection Details

### Broker Information

- **Host**: `customer.streaming-cardata.bmwgroup.com`
- **Port**: `9000`
- **Protocol**: MQTT 3.1.1 / 5.0
- **Transport**: SSL/TLS (secure WebSocket or TCP)
- **Certificate**: CA-signed server certificates (standard SSL trust chain)

### Authentication

MQTT authentication uses credentials derived from the OAuth 2.0 Device Code Flow tokens:

- **Username**: `gcid` field from the OAuth token response
- **Password**: `id_token` (JWT) from the OAuth token response
- **Client ID**: Generated idempotent value (recommended: VIN-based or stable UUID per device)

**Important Notes**:

- The `id_token` serves as the MQTT password (not the `access_token`)
- The `gcid` (Global Customer ID) identifies the user account
- Client ID should be stable across reconnections for session persistence
- Tokens must be refreshed when the `id_token` expires (typically 3600 seconds)

## Subscription Model

### Topic Structure

Each vehicle has a dedicated topic based on username (gcid) and VIN:

- **Topic Pattern**: `{username}/{VIN}` where username is the gcid from OAuth token
- **Example**: `gcid-abc123/WBAJA91000CD48772`
- **Multi-Vehicle Subscription**: `{username}/+` subscribes to all vehicles for a user (wildcard)
- **QoS**: Recommended QoS 1 (at least once delivery)

**Implementation Note**: For now, we subscribe per-VIN (`{username}/{VIN}`). Future enhancement: centralized listener using `{username}/+` wildcard to reduce connections.

### Subscription Lifecycle

1. **Connect**: Establish MQTT connection with OAuth credentials
2. **Subscribe**: Subscribe to vehicle's VIN topic
3. **Receive**: Handle incoming telematic data messages
4. **Disconnect**: Gracefully unsubscribe and disconnect on cleanup

## Message Format

### Message Structure

```json
{
  "vin": "WBAJA91000CD48772",
  "entityId": "187d32c4-6ce2-470f-9f3d-81ba54bcc4da",
  "topic": "WBAJA91000CD48772",
  "timestamp": "2025-10-18T19:09:05.091Z",
  "data": {
    "vehicle.vehicle.travelledDistance": {
      "timestamp": "2025-10-18T19:09:04Z",
      "value": 87897,
      "unit": "km"
    }
  }
}
```

### Field Descriptions

- **vin**: Vehicle Identification Number (17 characters)
- **entityId**: Unique identifier for the vehicle entity (UUID)
- **topic**: MQTT topic (matches VIN)
- **timestamp**: ISO 8601 timestamp when message was sent
- **data**: Object containing telematic data points

### Telematic Data Points

Each telematic data point within the `data` object has:

- **Key**: Telematic key in dot notation (e.g., `vehicle.vehicle.travelledDistance`)
- **Value**: Object with:
  - `timestamp`: ISO 8601 timestamp when data was collected
  - `value`: Actual data value (number, string, boolean)
  - `unit`: Unit of measurement (e.g., "km", "degrees", "%", "bar")

### Message Characteristics

- **Frequency**: Real-time (messages sent when vehicle data changes)
- **Granularity**: Individual telematic keys (partial updates)
- **Size**: Small payloads (typically 1-5 telematic keys per message)
- **Order**: Not guaranteed (may arrive out of order)
- **Batching Behavior**: BMW server may send rapid-fire updates (10+ messages in <1s)

### Message Batching Pattern (Client-Side Optimization)

**Problem**: BMW's MQTT broker sends rapid-fire telematic key updates, causing overhead from processing each message individually.

**Solution**: 1-Second Batching Window

- Queue incoming MQTT messages for 1 second before processing
- Merge all messages in the window into a single state update
- Reduces overhead from 10+ individual updates to 1 batch update
- Prevents UI flickering from rapid capability changes
- 1-second delay is acceptable for user experience

**Implementation Pattern:**

```typescript
private mqttBatchQueue: StreamMessage[] = [];
private mqttBatchTimer: NodeJS.Timeout | null = null;

updateFromMqttMessage(message: StreamMessage): void {
  // Add to batch queue
  this.mqttBatchQueue.push(message);

  // Reset 1-second timer (debounce pattern)
  if (this.mqttBatchTimer) {
    clearTimeout(this.mqttBatchTimer);
  }

  this.mqttBatchTimer = setTimeout(async () => {
    const batch = [...this.mqttBatchQueue];
    this.mqttBatchQueue = [];

    // Merge all telematic keys from batch
    const mergedData: Record<string, TelematicDataPoint> = {};
    batch.forEach(msg => {
      Object.assign(mergedData, msg.data);
    });

    // Single state update for all merged data
    const updatedStatus = transformToVehicleStatus(mergedData);

    // Update UI capabilities once
    await updateCapabilities(updatedStatus);
  }, 1000);
}
```

**Benefits:**

- **Efficiency**: 10+ messages → 1 state update
- **Performance**: Reduced CPU/memory overhead
- **UX**: No UI flickering from rapid changes
- **Freshness**: 1-second delay imperceptible to users
- **Memory**: Batch cleared after processing (no leaks)

**Trade-offs:**

- ✅ Real-time data still near-instant (1s delay)
- ✅ Most recent value wins (proper timestamp handling)
- ✅ Batch window resets on new messages (debounce)
- ⚠️ Messages may be slightly delayed during rapid updates

## Telematic Keys

MQTT messages use the same telematic key format as the REST API. Common keys include:

### Location

- `vehicle.cabin.infotainment.navigation.currentLocation.latitude` (degrees)
- `vehicle.cabin.infotainment.navigation.currentLocation.longitude` (degrees)
- `vehicle.cabin.infotainment.navigation.currentLocation.heading` (degrees)

### Distance

- `vehicle.vehicle.travelledDistance` (km or miles)

### Battery (Electric Vehicles)

- `vehicle.drivetrain.hvBattery.stateOfCharge` (%)
- `vehicle.drivetrain.hvBattery.remainingRange` (km or miles)
- `vehicle.drivetrain.charging.isCharging` (boolean)

### Doors and Windows

- `vehicle.body.doors.frontLeft.isOpen` (boolean)
- `vehicle.body.windows.frontLeft.isOpen` (boolean)

### Climate

- `vehicle.cabin.climate.preconditioningActivity` (enum: READY, HEATING, COOLING, etc.)

**Note**: See `lib/api/TelematicKeys.ts` for the complete list of 244+ telematic keys.

## Connection Lifecycle

### Reconnection Strategy

MQTT connections should implement automatic reconnection with exponential backoff:

1. **Initial Delay**: 1 second
2. **Maximum Delay**: 60 seconds
3. **Backoff Multiplier**: 2x (1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s...)
4. **Jitter**: Add random 0-1000ms to prevent thundering herd

### Connection States

- **DISCONNECTED**: Not connected to broker
- **CONNECTING**: Connection attempt in progress
- **CONNECTED**: Successfully connected and authenticated
- **RECONNECTING**: Attempting to reconnect after disconnect
- **ERROR**: Connection failed with unrecoverable error

### Error Handling

Common error scenarios:

- **Authentication Failed**: Invalid `gcid` or `id_token` (refresh OAuth tokens)
- **Connection Timeout**: Network issue or broker unavailable (retry with backoff)
- **Token Expired**: `id_token` expired (refresh via OAuth flow)
- **Topic Not Found**: VIN not associated with user account (verify vehicle ownership)

## Integration with REST API

### Complementary Usage

MQTT streaming and REST API should be used together:

- **MQTT**: Real-time updates for frequently changing data (location, charging, doors)
- **REST API**: Initial state fetch, infrequent data (VIN, model, capabilities)
- **Fallback**: Use REST API polling if MQTT unavailable

### Rate Limit Conservation

By using MQTT for real-time updates, the 50 requests/24h REST API limit can be reserved for:

- Initial vehicle discovery during pairing
- Container management (create/list containers)
- Vehicle basic data (VIN, model, year)
- Fallback when MQTT disconnected

### Data Consistency

- MQTT messages provide partial updates (individual keys)
- Maintain local state and merge MQTT updates with REST API data
- Use REST API to fetch complete state after reconnection
- Timestamp comparison to handle out-of-order messages

## Scopes and Permissions

### Required OAuth Scopes

MQTT streaming requires the following scopes during OAuth authorization:

- `cardata.vehicle.telematic:read` - Read telematic data
- `offline_access` - Refresh token for long-lived sessions

**Note**: The same scopes used for REST API access enable MQTT streaming.

## Best Practices

### Connection Management

1. **Single Connection Per Device**: One MQTT client per vehicle device
2. **Lazy Connection**: Connect only when device is active/not suspended
3. **Clean Disconnect**: Unsubscribe and disconnect gracefully on device removal
4. **Persistent Sessions**: Use clean session = false for QoS 1+ messages

### Message Handling

1. **Async Processing**: Handle messages asynchronously to avoid blocking
2. **State Merging**: Merge partial updates with existing state
3. **Timestamp Validation**: Check message timestamp vs. current state timestamp
4. **Error Recovery**: Continue processing even if individual message parsing fails

### Performance

1. **Message Batching**: Buffer multiple updates before updating UI/capabilities
2. **Debouncing**: Avoid updating capabilities too frequently (e.g., max once per second)
3. **Memory Management**: Limit message queue size to prevent memory leaks
4. **Connection Pooling**: Reuse connection when possible

### Security

1. **Token Storage**: Store OAuth tokens securely (never log `id_token`)
2. **TLS Verification**: Always verify server certificate
3. **Token Refresh**: Refresh tokens before expiration
4. **Secure Logging**: Redact sensitive data (VIN, gcid, tokens) in logs

## Limitations

### Known Limitations

- **Availability**: Not available for BMW Motorrad motorcycles
- **Message Order**: Messages may arrive out of order
- **Message Loss**: Network issues may cause message loss (use QoS 1+)
- **Latency**: 1-5 second delay typical (not real-time critical)
- **Frequency**: Limited by vehicle telematics update rate (~1-30 seconds)

### Unsupported Features

- **Command Execution**: Cannot send commands via MQTT (read-only)
- **Historical Data**: No message history (only live stream)
- **Multi-Vehicle**: One subscription per vehicle (cannot subscribe to all vehicles)

## Testing

### Mock Broker

For development/testing without real vehicle:

1. **Use Aedes**: Lightweight MQTT broker for Node.js
2. **Mock Messages**: Send test messages matching BMW format
3. **Test Scenarios**: Connection, reconnection, token expiry, message parsing

### Integration Testing

1. **Real Broker**: Test with actual BMW MQTT broker
2. **Token Management**: Test token refresh during active connection
3. **Error Scenarios**: Test network disconnect, invalid auth, malformed messages
4. **Long-Running**: Test connection stability over 24+ hours

## References

- BMW CarData API Documentation: `bmw-cardata-ha/cardata_api_documentation.md`
- BMW Streaming Documentation: `bmw-cardata-ha/Streaming Documentation`
- Python Reference Implementation: `bmw-cardata-ha/custom_components/cardata/coordinator.py`
- MQTT.js Library: <https://github.com/mqttjs/MQTT.js>
- MQTT Protocol Specification: <https://mqtt.org/>
