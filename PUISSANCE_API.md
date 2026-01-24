# Puissance KPI Endpoint Documentation

## Overview

The new dedicated Puissance endpoint makes a single API call that internally handles 9 optimized batch requests to ThingsBoard to fetch all telemetry data needed for the Puissance view.

**Endpoint:** `GET /telemetry/:deviceUUID/puissance`

## Benefits

1. **Single API Call** - Frontend makes one request instead of 9
2. **Optimized Queries** - Backend calculates correct timestamps and parameters for each data request
3. **Parallel Fetching** - All 9 requests execute in parallel using `Promise.all()`
4. **Data Aggregation** - Returns calculated KPI values and chart data ready for display
5. **Error Resilience** - Gracefully handles individual telemetry request failures
6. **Debug Mode** - Optional debug parameter shows which requests were made and how many data points each returned

## API Usage

### Basic Request

```bash
GET http://localhost:4000/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/puissance
```

### With Debug Information

```bash
GET http://localhost:4000/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/puissance?debug=true
```

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "instantaneousPower": 12310.8,
    "consumedThisHour": 125.45,
    "consumedToday": 856.32,
    "consumedYesterday": 842.15,
    "consumedThisMonth": 18456.78,
    "consumedLastMonth": 27341.92,
    "hourlyData": [
      { "ts": 1705689600000, "value": 45.23 },
      { "ts": 1705693200000, "value": 52.18 }
    ],
    "dailyData": [
      { "ts": 1705689600000, "value": 842.15 },
      { "ts": 1705776000000, "value": 856.32 }
    ],
    "monthlyData": [
      { "ts": 1702771200000, "value": 27341.92 },
      { "ts": 1705449600000, "value": 18456.78 }
    ]
  },
  "meta": {
    "deviceUUID": "545ffcb0-ab9c-11f0-a05e-97f672464deb",
    "deviceName": "PM2200 - TGBT Principal",
    "requestedAt": 1705932090674
  }
}
```

### With Debug Information

```json
{
  "success": true,
  "data": { ... },
  "meta": { ... },
  "debug": {
    "requests": [
      {
        "id": "instantaneous",
        "keys": ["ActivePowerTotal"],
        "startTs": 1705845690674,
        "endTs": 1705932090674,
        "resultPoints": 1
      },
      {
        "id": "thisHour",
        "keys": ["deltaHourEnergyConsumtion"],
        "startTs": 1705928490674,
        "endTs": 1705932090674,
        "resultPoints": 1
      },
      {
        "id": "todayHourly",
        "keys": ["deltaHourEnergyConsumtion"],
        "startTs": 1705862400000,
        "endTs": 1705932090674,
        "interval": 3600000,
        "resultPoints": 19
      },
      ...
    ]
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Device not found or authentication failed"
}
```

## Response Fields

### KPI Values (in `data` object)

| Field | Type | Description | Unit |
|-------|------|-------------|------|
| `instantaneousPower` | number ∣ null | Latest power reading | kW |
| `consumedThisHour` | number ∣ null | Energy consumed in current hour | kWh |
| `consumedToday` | number ∣ null | Total energy consumed today | kWh |
| `consumedYesterday` | number ∣ null | Total energy consumed yesterday | kWh |
| `consumedThisMonth` | number ∣ null | Total energy consumed this month | kWh |
| `consumedLastMonth` | number ∣ null | Total energy consumed last month | kWh |
| `hourlyData` | array | Hourly consumption for today | Array of {ts, value} |
| `dailyData` | array | Daily consumption for this month | Array of {ts, value} |
| `monthlyData` | array | Monthly consumption for last 12 months | Array of {ts, value} |

### Chart Data Format

Each chart data point has:
```typescript
{
  ts: number,      // Timestamp in milliseconds (UTC)
  value: number    // Consumption value in kWh
}
```

### Metadata (in `meta` object)

| Field | Type | Description |
|-------|------|-------------|
| `deviceUUID` | string | UUID of the queried device |
| `deviceName` | string | Human-readable device name |
| `requestedAt` | number | Timestamp when the request was processed (ms) |

### Debug Information (in `debug` object, only when `debug=true`)

Each request in the `requests` array contains:
```typescript
{
  id: string,           // Request identifier
  keys: string[],       // Telemetry keys requested
  startTs: number,      // Start timestamp (ms)
  endTs: number,        // End timestamp (ms)
  interval?: number,    // Aggregation interval if applicable
  agg?: string,         // Aggregation function if applicable
  resultPoints: number  // Number of data points returned
}
```

## Internal Request Details

### 9 Batch Requests Made

1. **Instantaneous Power** (1 value)
   - Keys: `ActivePowerTotal`
   - Range: Last 24 hours
   - Agg: `NONE` (raw)
   - Limit: 1 (latest)
   - OrderBy: `DESC`

2. **This Hour Energy** (1 value)
   - Keys: `deltaHourEnergyConsumtion`
   - Range: Last 1 hour
   - Agg: `NONE` (raw)
   - Limit: 1 (latest)
   - OrderBy: `DESC`

3. **Last 24 Hours** (for yesterday calculation)
   - Keys: `AccumulatedActiveEnergyDelivered`
   - Range: Last 24 hours
   - Agg: `NONE` (raw)
   - Limit: 10000
   - OrderBy: `ASC`

4. **Today's Total** (today calculation)
   - Keys: `AccumulatedActiveEnergyDelivered`
   - Range: Midnight UTC to now
   - Agg: `NONE` (raw)
   - Limit: 10000
   - OrderBy: `ASC`

5. **This Month's Total** (this month calculation)
   - Keys: `AccumulatedActiveEnergyDelivered`
   - Range: 1st of month to now
   - Agg: `NONE` (raw)
   - Limit: 10000
   - OrderBy: `ASC`

6. **Last Month's Total** (last month calculation)
   - Keys: `AccumulatedActiveEnergyDelivered`
   - Range: 1st to end of previous month
   - Agg: `NONE` (raw)
   - Limit: 10000
   - OrderBy: `ASC`

7. **Today's Hourly Data** (24 data points)
   - Keys: `deltaHourEnergyConsumtion`
   - Range: Midnight UTC to now
   - Interval: 3600000 (1 hour)
   - Agg: `SUM`
   - Limit: 24
   - OrderBy: `ASC`

8. **This Month's Daily Data** (28-31 data points)
   - Keys: `AccumulatedActiveEnergyDelivered`
   - Range: 1st of month to now
   - Agg: `NONE` (raw)
   - Limit: 10000
   - OrderBy: `ASC`
   - Processing: Grouped by day

9. **Last 12 Months' Data** (12 data points)
   - Keys: `AccumulatedActiveEnergyDelivered`
   - Range: 12 months ago to now
   - Agg: `NONE` (raw)
   - Limit: 10000
   - OrderBy: `ASC`
   - Processing: Grouped by month

## Time Range Calculations

All time ranges are calculated server-side relative to the current moment:

```typescript
const now = Date.now()  // Current timestamp in milliseconds

// Last 1 hour
start = now - 3600000
end = now

// Last 24 hours
start = now - 86400000
end = now

// Today (midnight UTC to now)
start = new Date(now).setUTCHours(0, 0, 0, 0)
end = now

// Yesterday
start = todayMidnight - 86400000
end = todayMidnight

// This month (1st of month to now)
start = new Date(now).setUTCDate(1).setUTCHours(0, 0, 0, 0)
end = now

// Last month (full month boundary)
start = new Date(now).setUTCMonth(now.getUTCMonth() - 1)
end = new Date(now).setUTCDate(0)

// Last 12 months
start = new Date(now).setUTCMonth(now.getUTCMonth() - 12)
end = now
```

## Integration in Frontend

### Example: PuissanceView.vue

```typescript
import { useTelemetry } from '@/composables/useTelemetry'

const { telemetryService } = useTelemetry()

// Fetch all Puissance KPI values
async function loadPuissanceData() {
  try {
    const response = await fetch(
      `/telemetry/${deviceUUID}/puissance?debug=false`
    )
    const result = await response.json()

    if (result.success) {
      // Update KPI cards with values
      kpiValues.value.instantaneousPower = result.data.instantaneousPower
      kpiValues.value.consumedThisHour = result.data.consumedThisHour
      kpiValues.value.consumedToday = result.data.consumedToday
      kpiValues.value.consumedYesterday = result.data.consumedYesterday
      kpiValues.value.consumedThisMonth = result.data.consumedThisMonth
      kpiValues.value.consumedLastMonth = result.data.consumedLastMonth

      // Update chart data
      chartData.hourly = result.data.hourlyData
      chartData.daily = result.data.dailyData
      chartData.monthly = result.data.monthlyData

      // Log device info
      console.log(`Loaded data for ${result.meta.deviceName}`)
    }
  } catch (error) {
    console.error('Failed to load Puissance data:', error)
  }
}

// Call on mount
onMounted(() => {
  loadPuissanceData()
})
```

## Error Handling

The endpoint returns:

- **200 OK**: Successful response (even if some individual requests failed)
- **400 Bad Request**: Missing or invalid parameters
- **404 Not Found**: Device not found
- **502 Bad Gateway**: Error communicating with ThingsBoard

When individual telemetry requests fail, the affected KPI values will be `null` in the response, allowing partial data to still be displayed.

## Performance Considerations

- **Parallel Execution**: All 9 requests are executed in parallel using `Promise.all()`, not sequentially
- **Caching**: Consider implementing response caching in the frontend to avoid excessive requests
- **Rate Limiting**: ThingsBoard may have rate limits; monitor response times
- **Auto-Refresh**: Recommended refresh interval is 30-60 seconds, not continuous

## Testing

### PowerShell Test

```powershell
$deviceUUID = "545ffcb0-ab9c-11f0-a05e-97f672464deb"
$response = Invoke-WebRequest -Uri "http://localhost:4000/telemetry/$deviceUUID/puissance?debug=true"
$response.Content | ConvertFrom-Json | ConvertTo-Json | Out-Host
```

### Browser Console Test

```javascript
fetch('/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/puissance?debug=true')
  .then(r => r.json())
  .then(data => {
    console.log('Puissance Data:', data)
    console.log('Instantaneous Power:', data.data.instantaneousPower, 'kW')
    console.log('Consumed Today:', data.data.consumedToday, 'kWh')
    console.log('Number of hourly data points:', data.data.hourlyData.length)
  })
```

## Migration from Frontend-Side Requests

### Before (Frontend makes 9 requests):

```typescript
// Frontend code - 9 separate requests
const instantaneous = await fetch(`/telemetry/${uuid}/timeseries?keys=ActivePowerTotal&...`)
const thisHour = await fetch(`/telemetry/${uuid}/timeseries?keys=deltaHourEnergyConsumtion&...`)
const today = await fetch(`/telemetry/${uuid}/timeseries?keys=AccumulatedActiveEnergyDelivered&...`)
// ... 6 more requests
```

### After (Single endpoint):

```typescript
// Frontend code - 1 request
const result = await fetch(`/telemetry/${uuid}/puissance`)
const { data } = await result.json()

// All values and chart data available immediately
const { instantaneousPower, consumedToday, hourlyData } = data
```

## Troubleshooting

### Getting `null` values for specific KPIs

Check the `debug` output to see if specific requests returned 0 data points. This indicates:
- Meter was not active during that time period
- Device hasn't reported that telemetry key yet
- Time range query parameters need adjustment

### Response time is slow

1. Monitor individual request times via debug mode
2. Check ThingsBoard server load and connectivity
3. Consider implementing caching in the frontend
4. Verify database has proper indexes for time-based queries

### Device not found error

Verify:
1. Device UUID is correct
2. Device has an access token configured in ThingsBoard
3. Backend can communicate with ThingsBoard server
4. Device is not archived or inactive

## Server Logs

The PuissanceService logs important information:

```
[PuissanceService] Calculating KPIs for device: PM2200 - TGBT Principal
[PuissanceService] Time Ranges: { last1h: {...}, today: {...}, ... }
[PuissanceService] Fetched telemetry: keys=ActivePowerTotal resultPoints=1
[PuissanceService] KPIs calculated successfully: { instantaneousPower: 12310.8, ... }
```

Enable debug logging to see these messages:

```bash
LOG_LEVEL=debug npm start
```

## API Change Log

### v1.0 (Initial Release)

- Single endpoint for all Puissance KPI data
- 9 optimized batch requests to ThingsBoard
- Returns KPI values, chart data, and metadata
- Optional debug mode for request transparency
- Parallel request execution using Promise.all()
- Graceful error handling for individual request failures
