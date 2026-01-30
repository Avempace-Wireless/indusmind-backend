# Current KPI Endpoint Documentation

## Overview

The new dedicated Current endpoint makes a single API call that internally handles 9 optimized batch requests to ThingsBoard to fetch all telemetry data needed for the Current view.

**Endpoint:** `GET /telemetry/:deviceUUID/current`

## Benefits

1. **Single API Call** - Frontend makes one request instead of 7
2. **Optimized Queries** - Backend calculates correct timestamps and parameters for each data request
3. **Parallel Fetching** - All 7 requests execute in parallel using `Promise.all()`
4. **Data Aggregation** - Returns calculated KPI values and chart data ready for display
5. **Proper Aggregations** - Uses MAX aggregation for widget data (15-min intervals) and AVERAGE for chart data
6. **Error Resilience** - Gracefully handles individual telemetry request failures
7. **Debug Mode** - Optional debug parameter shows which requests were made and how many data points each returned

## API Usage

### Basic Request

```bash
GET http://localhost:4000/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/current
```

### With Debug Information

```bash
GET http://localhost:4000/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/current?debug=true
```

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "instantaneousCurrent": 12.34,
    "lastHourMin": 10.5,
    "lastHourAverage": 11.8,
    "lastHourMax": 14.2,
    "todayAverage": 12.1,
    "hourlyData": [
      { "ts": 1705689600000, "value": 12.1 },
      { "ts": 1705693200000, "value": 12.3 }
    ],
    "widgetData": [
      { "ts": 1705689600000, "value": 12.1 },
      { "ts": 1705690500000, "value": 13.2 }
    ],
    "dailyWeekData": [
      { "ts": 1705689600000, "value": 12.0 },
      { "ts": 1705776000000, "value": 11.9 },
      { "ts": 1705862400000, "value": 12.1 }
    ],
    "dailyMonthData": [
      { "ts": 1705689600000, "value": 12.0 },
      { "ts": 1705776000000, "value": 11.9 },
      { "ts": 1705862400000, "value": 12.1 }
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
        "keys": ["Current_Avg"],
        "startTs": 1705845690674,
        "endTs": 1705932090674,
        "agg": "NONE",
        "limit": 1,
        "resultPoints": 1
      },
      {
        "id": "lastHourMin",
        "keys": ["Current_Avg"],
        "startTs": 1705928490674,
        "endTs": 1705932090674,
        "agg": "MIN",
        "resultPoints": 1
      },
      {
        "id": "lastHourAvg",
        "keys": ["Current_Avg"],
        "startTs": 1705928490674,
        "endTs": 1705932090674,
        "agg": "AVG",
        "resultPoints": 1
      },
      {
        "id": "lastHourMax",
        "keys": ["Current_Avg"],
        "startTs": 1705928490674,
        "endTs": 1705932090674,
        "agg": "MAX",
        "resultPoints": 1
      },
      {
        "id": "todayAvg",
        "keys": ["Current_Avg"],
        "startTs": 1705862400000,
        "endTs": 1705932090674,
        "agg": "AVG",
        "resultPoints": 1
      },
      {
        "id": "widgetData",
        "keys": ["Current_Avg"],
        "startTs": 1705928490674,
        "endTs": 1705932090674,
        "interval": 900000,
        "agg": "MAX",
        "resultPoints": 4
      },
      {
        "id": "hourlyData",
        "keys": ["Current_Avg"],
        "startTs": 1705862400000,
        "endTs": 1705932090674,
        "interval": 3600000,
        "agg": "AVG",
        "resultPoints": 19
      }
    ]
  }
}
```

## Data Request Details

The endpoint fetches 9 pieces of data:

### 1. Instantaneous Current (Latest value)
- **Keys:** `Current_Avg`
- **Time Range:** Last 24 hours
- **Aggregation:** `NONE` (latest only)
- **Limit:** 1
- **Order:** DESC
- **Returns:** Single value in Amperes

### 2. Last Hour Minimum
- **Keys:** `Current_Avg`
- **Time Range:** Last 1 hour
- **Aggregation:** `MIN`
- **Returns:** Minimum current value for the last hour

### 3. Last Hour Average
- **Keys:** `Current_Avg`
- **Time Range:** Last 1 hour
- **Aggregation:** `AVG`
- **Returns:** Average current value for the last hour

### 4. Last Hour Maximum (Widget Data - MAX Aggregation)
- **Keys:** `Current_Avg`
- **Time Range:** Last 1 hour
- **Aggregation:** `MAX`
- **Returns:** Maximum current value for the last hour
- **Note:** Matches ThingsBoard widget configuration

### 5. Today's Average
- **Keys:** `Current_Avg`
- **Time Range:** Start of today to now
- **Aggregation:** `AVG`
- **Returns:** Average current value for today

### 6. Widget Data (Last Hour with 15-min Intervals)
- **Keys:** `Current_Avg`
- **Time Range:** Last 1 hour
- **Aggregation:** `MAX`
- **Interval:** 15 minutes (900000 ms)
- **Returns:** Array of current values with MAX aggregation every 15 minutes
- **Use Case:** Widget gauge display showing recent variations
- **Note:** Matches ThingsBoard widget configuration exactly

### 7. Hourly Data (Today with 1-hour Intervals)
- **Keys:** `Current_Avg`
- **Time Range:** Start of today to now
- **Aggregation:** `AVG`
- **Interval:** 1 hour (3600000 ms)
- **Returns:** Array of current values with AVERAGE aggregation every hour
- **Use Case:** Chart display showing hourly trend throughout the day
- **Note:** Matches ThingsBoard chart widget configuration

### 8. Daily Week Data (Last 7 days with 1-day Intervals)
- **Keys:** `Current_Avg`
- **Time Range:** Last 7 days to now
- **Aggregation:** `AVG`
- **Interval:** 1 day (86400000 ms)
- **Returns:** Array of current values with AVERAGE aggregation every day
- **Use Case:** Weekly trend analysis and comparison

### 9. Daily Month Data (Last 30 days with 1-day Intervals)
- **Keys:** `Current_Avg`
- **Time Range:** Last 30 days to now
- **Aggregation:** `AVG`
- **Interval:** 1 day (86400000 ms)
- **Returns:** Array of current values with AVERAGE aggregation every day
- **Use Case:** Monthly trend analysis and long-term monitoring

## Time Ranges

All times are calculated server-side:

```typescript
// Today boundaries (start of day to now)
const todayStart = new Date(now)
todayStart.setHours(0, 0, 0, 0)
const todayStartTs = todayStart.getTime()

// Last hour
const lastHourStart = now - 60 * 60 * 1000 // 1 hour ago
const lastHourEnd = now

// Last 24 hours
const last24hStart = now - 24 * 60 * 60 * 1000
const last24hEnd = now

// Last 7 days
const last7daysStart = now - 7 * 24 * 60 * 60 * 1000
const last7daysEnd = now

// Last 30 days
const last30daysStart = now - 30 * 24 * 60 * 60 * 1000
const last30daysEnd = now
```

## Frontend Integration

### Using useCurrent Composable

```typescript
import { useCurrent } from '@/composables/current/useCurrent'

const { fetchCurrentKPIs, getKPIs, getChartData } = useCurrent()

// Fetch data for a device
const deviceUUID = '545ffcb0-ab9c-11f0-a05e-97f672464deb'
await fetchCurrentKPIs(deviceUUID, { debug: true })

// Get KPI values
const kpis = getKPIs(deviceUUID)
console.log(kpis.instantaneousCurrent) // 12.34 A
console.log(kpis.lastHourAverage)      // 11.8 A
console.log(kpis.todayAverage)         // 12.1 A

// Get chart data
const chartData = getChartData(deviceUUID)
chartData.widget      // Last hour with 15-min intervals (MAX)
chartData.hourly      // Today's hourly data (AVERAGE)
chartData.dailyWeek   // Last 7 days daily data (AVERAGE)
chartData.dailyMonth  // Last 30 days daily data (AVERAGE)
```

### Example: CurrentView Integration

```typescript
import { useCurrent } from '@/composables/current/useCurrent'

const { fetchCurrentKPIs, getKPIs, getChartData } = useCurrent()

// Load data for all selected meters
const deviceUUIDs = selectedMeters.map(m => m.deviceUUID)
await Promise.all(
  deviceUUIDs.map(uuid => fetchCurrentKPIs(uuid, { useCache: false }))
)

// Display KPI cards
for (const meterId of selectedMeters) {
  const kpis = getKPIs(meterId.deviceUUID)
  // Display kpis.instantaneousCurrent, lastHourAvg, etc.
}

// Display charts
const chartData = getChartData(selectedMeterId.deviceUUID)
// Use chartData.hourly for main chart (hourly average)
// Use chartData.widget for widget gauge (15-min MAX)
```

## Caching

The frontend composable implements 30-second caching:

```typescript
const CACHE_DURATION = 30000 // 30 seconds

// Cached results are reused within 30 seconds
const result = await fetchCurrentKPIs(deviceUUID, { useCache: true })

// Force fresh data
const freshResult = await fetchCurrentKPIs(deviceUUID, { useCache: false })
```

## Error Handling

### Invalid Device UUID

```bash
GET http://localhost:4000/telemetry/invalid-uuid/current
```

Response:
```json
{
  "success": false,
  "error": "Device not found"
}
```

### ThingsBoard Connection Error

```json
{
  "success": false,
  "error": "Failed to connect to ThingsBoard: Connection timeout"
}
```

## Performance Characteristics

- **Response Time:** 300-700ms (with 9 parallel ThingsBoard requests)
- **Data Points:** ~4 widget + 24 hourly + 7 daily week + 30 daily month = ~65 total per device
- **Network Size:** ~15-25 KB response body
- **Caching:** 30-second client-side cache reduces repeated requests

## Common Use Cases

### Real-time Current Monitoring
```typescript
// Fetch instantaneous current every 5 seconds
setInterval(async () => {
  const result = await fetchCurrentKPIs(deviceUUID, { useCache: false })
  updateWidget(result.data.instantaneousCurrent)
}, 5000)
```

### Daily Trend Analysis
```typescript
// Get daily weekly trend for week-over-week comparison
const chartData = await getChartData(deviceUUID)
displayWeeklyChart(chartData.dailyWeek) // Shows 7 daily points
```

### Monthly Trend Analysis
```typescript
// Get daily monthly trend for trend analysis
const chartData = await getChartData(deviceUUID)
displayMonthlyChart(chartData.dailyMonth) // Shows ~30 daily points
```

### Multi-Device Comparison
```typescript
// Fetch data for all selected devices
const results = await Promise.all(
  deviceUUIDs.map(uuid => fetchCurrentKPIs(uuid))
)

// Compare instantaneous values
const comparison = results.map(r => ({
  device: r.meta.deviceName,
  current: r.data.instantaneousCurrent
}))
```

## Testing

Run the backend server:

```bash
cd indusmind-backend
npm run dev
```

Test with curl:

```bash
# Get Current KPIs
curl "http://localhost:4000/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/current"

# With debug information
curl "http://localhost:4000/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/current?debug=true"
```

## Architecture

```
CurrentView.vue
  ↓
useCurrent Composable
  ↓
GET /telemetry/:deviceUUID/current
  ↓
Backend: CurrentService
  ↓
  ├─ Instantaneous: getTimeseries(NONE, limit=1)
  ├─ LastHourMin: getTimeseries(MIN)
  ├─ LastHourAvg: getTimeseries(AVG)
  ├─ LastHourMax: getTimeseries(MAX)
  ├─ TodayAvg: getTimeseries(AVG)
  ├─ WidgetData: getTimeseries(MAX, interval=15min)
  ├─ HourlyData: getTimeseries(AVG, interval=1hour)
  ├─ DailyWeekData: getTimeseries(AVG, interval=1day)
  └─ DailyMonthData: getTimeseries(AVG, interval=1day)
  ↓
  ├─ ThingsBoard API (9 parallel requests)
  │   └─ GET /api/plugins/telemetry/DEVICE/:deviceUUID/values/timeseries
  │
  └─ Response Aggregation & Transformation
      └─ JSON Response with all KPI values and chart data
```

## Related APIs

- **Puissance API:** `/telemetry/:deviceUUID/puissance` - Energy consumption monitoring
- **Energy History API:** `/telemetry/:deviceUUID/energy-history` - Historical energy data
- **Generic Timeseries API:** `/telemetry/:deviceUUID/timeseries` - Raw telemetry data fetching
