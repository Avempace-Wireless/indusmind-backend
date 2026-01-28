# Thermal Management API

Backend API endpoint for thermal management view that fetches temperature sensor telemetry data from ThingsBoard.

## Overview

The Thermal API endpoint provides aggregated data for all T_Sensor devices, including:
- **Telemetry data**: Temperature, Humidity, DewPoint, RawSht3xData, Time
- **Metadata attributes**: active, label, powerStatus, displayName, hideAutoMode, delay
- **Summary statistics**: Total sensors, active sensors, temperature statistics

## Endpoint

### GET /api/telemetry/thermal

Fetches all thermal sensor data for the thermal management dashboard.

**Base URL**: `http://localhost:5000` (development) or your production URL

**Full URL**: `http://localhost:5000/api/telemetry/thermal`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `debug` | boolean | No | Include debug information about ThingsBoard API requests |

**Example**:
```
GET /api/telemetry/thermal?debug=true
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "sensors": [
      {
        "id": 1,
        "deviceUUID": "abc-123-def-456",
        "name": "T_Sensor_Zone_A",
        "label": "Temperature Sensor A",
        "zone": "Zone A",
        
        // Metadata (from ThingsBoard attributes)
        "active": true,
        "powerStatus": true,
        "displayName": "Zone A Sensor",
        "hideAutoMode": false,
        "delay": 5000,
        
        // Telemetry (latest values)
        "temperature": 21.5,
        "humidity": 45.2,
        "dewPoint": 9.8,
        "rawData": {
          "Temperature": 21.5,
          "Humidity": 45.2,
          "DewPoint": 9.8
        },
        "timestamp": "2026-01-28T10:30:00.000Z",
        "lastUpdate": 1706438400000
      },
      {
        "id": 2,
        "deviceUUID": "xyz-789-ghi-012",
        "name": "T_Sensor_Zone_B",
        "label": "Temperature Sensor B",
        "zone": "Zone B",
        "active": true,
        "powerStatus": true,
        "displayName": "Zone B Sensor",
        "hideAutoMode": false,
        "delay": 5000,
        "temperature": 22.8,
        "humidity": 42.1,
        "dewPoint": 10.2,
        "rawData": {
          "Temperature": 22.8,
          "Humidity": 42.1,
          "DewPoint": 10.2
        },
        "timestamp": "2026-01-28T10:30:00.000Z",
        "lastUpdate": 1706438400000
      }
    ],
    "summary": {
      "totalSensors": 8,
      "activeSensors": 6,
      "averageTemperature": 22.3,
      "minTemperature": 19.5,
      "maxTemperature": 25.1
    }
  },
  "meta": {
    "requestedAt": 1706438400000,
    "sensorCount": 8
  }
}
```

### With Debug Info (debug=true)

```json
{
  "success": true,
  "data": { ... },
  "meta": { ... },
  "debug": {
    "requests": [
      {
        "deviceUUID": "abc-123-def-456",
        "keys": ["Temperature", "Humidity", "DewPoint", "RawSht3xData", "Time"],
        "resultFound": true
      },
      {
        "deviceUUID": "abc-123-def-456",
        "keys": ["active", "powerStatus", "displayName", "hideAutoMode", "delay"],
        "resultFound": true
      }
    ]
  }
}
```

### Error Response (502 Bad Gateway)

```json
{
  "success": false,
  "error": "Failed to fetch devices from http://localhost:4000/customer/devices: connect ECONNREFUSED"
}
```

## Response Fields

### Sensor Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Sensor database ID |
| `deviceUUID` | string | ThingsBoard device UUID |
| `name` | string | Device name (e.g., "T_Sensor_Zone_A") |
| `label` | string | Device label/description |
| `zone` | string | Extracted zone name (e.g., "Zone A") |
| **Metadata** | | **From ThingsBoard Attributes** |
| `active` | boolean\|null | Sensor active status |
| `powerStatus` | boolean\|null | Power supply status |
| `displayName` | string\|null | Display name for UI |
| `hideAutoMode` | boolean\|null | Hide auto mode toggle |
| `delay` | number\|null | Data fetch delay in milliseconds |
| **Telemetry** | | **From ThingsBoard Telemetry** |
| `temperature` | number\|null | Current temperature in °C |
| `humidity` | number\|null | Current humidity in % |
| `dewPoint` | number\|null | Dew point in °C |
| `rawData` | object\|null | Raw sensor data JSON |
| `timestamp` | string\|null | ISO 8601 timestamp of reading |
| `lastUpdate` | number\|null | Unix timestamp (milliseconds) |

### Summary Object

| Field | Type | Description |
|-------|------|-------------|
| `totalSensors` | number | Total number of temperature sensors |
| `activeSensors` | number | Number of active sensors (active=true) |
| `averageTemperature` | number\|null | Average temperature across all sensors |
| `minTemperature` | number\|null | Minimum temperature recorded |
| `maxTemperature` | number\|null | Maximum temperature recorded |

## Implementation Details

### Service Layer

**File**: `src/services/thermal.service.ts`

The `ThermalService` class handles:
1. Fetching all devices from customer API
2. Filtering for T_Sensor devices (devices with "t_sensor" in name)
3. Fetching telemetry data for each sensor from ThingsBoard
4. Fetching metadata attributes for each sensor from ThingsBoard
5. Calculating summary statistics
6. Aggregating all data into a single response

### ThingsBoard API Calls

For each T_Sensor device, the service makes 2 ThingsBoard API calls:

#### 1. Telemetry Request
```
GET /api/plugins/telemetry/DEVICE/{deviceUUID}/values/timeseries
?keys=Temperature,Humidity,DewPoint,RawSht3xData,Time
&startTs={last24hours}
&endTs={now}
&agg=NONE
&orderBy=DESC
&limit=1
```

#### 2. Attributes Request
```
GET /api/plugins/telemetry/DEVICE/{deviceUUID}/values/attributes
?keys=active,powerStatus,displayName,hideAutoMode,delay
```

## Usage Examples

### cURL

```bash
# Basic request
curl http://localhost:5000/api/telemetry/thermal

# With debug info
curl "http://localhost:5000/api/telemetry/thermal?debug=true"
```

### JavaScript/TypeScript (Frontend)

```typescript
import axios from 'axios'

// Fetch thermal sensor data
const response = await axios.get('/api/telemetry/thermal')
const { sensors, summary } = response.data.data

console.log(`Total sensors: ${summary.totalSensors}`)
console.log(`Average temperature: ${summary.averageTemperature}°C`)

// Display each sensor
sensors.forEach(sensor => {
  console.log(`${sensor.zone}: ${sensor.temperature}°C (${sensor.active ? 'Active' : 'Inactive'})`)
})
```

### Postman

1. **Method**: GET
2. **URL**: `http://localhost:5000/api/telemetry/thermal`
3. **Query Params** (optional):
   - `debug`: `true`
4. **Send Request**

## Error Handling

The API handles several error scenarios:

1. **No sensors found**: Returns empty sensors array with success=true
2. **Individual sensor failures**: Returns partial data with null values for failed sensor
3. **ThingsBoard API errors**: Returns 502 Bad Gateway with error message
4. **Authentication failures**: Automatically retries with token refresh (up to 3 attempts)

## Performance Considerations

- **Parallel fetching**: All sensors are fetched in parallel using `Promise.all()`
- **Caching**: Device list is cached for 5 minutes to reduce API calls
- **Graceful degradation**: If metadata fetch fails, sensor still returns with null metadata
- **Timeout handling**: Uses ThingsBoard service's built-in retry mechanism

## Related Files

- **Service**: `src/services/thermal.service.ts`
- **Route**: `src/routes/telemetry.router.ts` (line 694+)
- **ThingsBoard Service**: `src/services/thingsboard/thingsboard-telemetry.service.ts`
- **Device Service**: `src/services/device.service.ts`

## Telemetry Keys Reference

### Temperature Sensor (T_Sensor)

| Key | Type | Description | Example |
|-----|------|-------------|---------|
| `Temperature` | number | Current temperature in °C | 51.1 |
| `Humidity` | number | Current humidity in % | 2.5 |
| `DewPoint` | number | Dew point in °C | 57.6 |
| `RawSht3xData` | JSON | Raw sensor data object | `{"Temperature":51.1,"Humidity":2.5,"DewPoint":57.6}` |
| `Time` | string | ISO 8601 timestamp | `2026-01-28T08:46:49.613Z` |

### Metadata Attributes (from datasources)

| Key | Type | Description | Example |
|-----|------|-------------|---------|
| `active` | boolean | Sensor active status | true |
| `label` | string | Device label | "Temperature Sensor A" |
| `powerStatus` | boolean | Power supply status | true |
| `displayName` | string | UI display name | "Zone A Sensor" |
| `hideAutoMode` | boolean | Hide auto mode toggle | false |
| `delay` | number | Data fetch delay (ms) | 5000 |

## Comparison with Similar Endpoints

### /current vs /puissance vs /thermal

| Feature | `/current` | `/puissance` | `/thermal` |
|---------|-----------|-------------|-----------|
| **Device Type** | PM2200 (meter) | PM2200 (meter) | T_Sensor (temperature) |
| **Single/Multi** | Single device | Single device | All sensors |
| **Path Param** | `:deviceUUID` | `:deviceUUID` | None |
| **Data Type** | Electrical current | Power/Energy | Temperature/Humidity |
| **Telemetry Keys** | Current_Avg | ActivePowerTotal, deltaHourEnergyConsumtion | Temperature, Humidity, DewPoint |
| **Metadata** | Device info | Device info | active, powerStatus, etc. |
| **Aggregation** | MIN/AVG/MAX | SUM | Latest values only |
| **Time Ranges** | Hour/Day/Week/Month/Year | Hour/Day/Month/Year | Last 24 hours |

## Testing

### Development Server

```bash
# Start backend server
cd indusmind-backend
npm run dev

# Test endpoint
curl http://localhost:5000/api/telemetry/thermal
```

### Production Testing

```bash
# Replace with your production URL
curl https://your-domain.com/api/telemetry/thermal
```

## Future Enhancements

Potential improvements for the thermal API:

1. **Historical data**: Add endpoint for temperature history over time
2. **Specific sensor**: Add `/thermal/:deviceUUID` for single sensor details
3. **Filtering**: Add query params for filtering by zone, active status
4. **Alerts**: Add temperature threshold alerts and notifications
5. **Aggregation intervals**: Add support for hourly/daily temperature aggregations
6. **WebSocket**: Add real-time temperature updates via WebSocket
7. **Caching**: Implement Redis caching for improved performance

## Support

For issues or questions:
- Check backend logs in `indusmind-backend/logs/`
- Enable debug mode: `?debug=true`
- Review ThingsBoard API documentation
- Check device configuration in customer API
