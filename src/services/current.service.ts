import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from './thingsboard/thingsboard-telemetry.service.js'
import { DeviceService } from './device.service.js'

const currentLogger = logger.child({ module: 'CurrentService' })

/**
 * Current KPI values response
 * Metrics for current consumption monitoring
 */
export interface CurrentKPIResponse {
  success: boolean
  data: {
    // Instantaneous values
    instantaneousCurrent: number | null // Latest Current_Avg in Amperes

    // Last hour statistics
    lastHourMin: number | null // Last hour minimum Current_Avg
    lastHourAverage: number | null // Last hour average Current_Avg
    lastHourMax: number | null // Last hour maximum Current_Avg (MAX aggregation for widget)

    // Daily statistics
    todayAverage: number | null // Today's average Current_Avg

    // Chart data
    hourlyData: Array<{ ts: number; value: number }> // Today's hourly average current data
    widgetData: Array<{ ts: number; value: number }> // Last hour data with 15-min intervals (MAX aggregation)
    dailyWeekData: Array<{ ts: number; value: number }> // Last 7 days daily average current data
    dailyMonthData: Array<{ ts: number; value: number }> // Last 30 days daily average current data
  }
  meta: {
    deviceUUID: string
    deviceName: string
    requestedAt: number
    timezone?: string
  }
  debug?: {
    requests: Array<{
      id: string
      keys: string[]
      startTs: number
      endTs: number
      interval?: number
      agg?: string
      resultPoints: number
    }>
  }
}

/**
 * Current Service
 * Handles fetching and calculating all values needed for the Current view
 * Uses Current_Avg telemetry key from ThingsBoard widgets configuration:
 * - Widget: Current_Avg with MAX aggregation, 15-min grouping interval
 * - Chart: Current_Avg with AVERAGE aggregation, 15-min grouping interval
 */
export class CurrentService {
  private logger = currentLogger

  constructor(
    private telemetryService: ThingsboardTelemetryService,
    private deviceService: DeviceService
  ) {}

  /**
   * Get all Current KPI values for a device
   * Makes optimized batch requests to ThingsBoard for all needed telemetry
   *
   * Fetches:
   * 1. Instantaneous: Latest Current_Avg value (last 24h, NONE, limit 1)
   * 2. Last Hour Min: Minimum Current_Avg for last hour (MIN aggregation)
   * 3. Last Hour Avg: Average Current_Avg for last hour (AVERAGE aggregation)
   * 4. Last Hour Max: Maximum Current_Avg for last hour (MAX aggregation for widget)
   * 5. Today Average: Average Current_Avg for today (AVERAGE aggregation)
   * 6. Widget Data: Last hour with 15-min intervals (MAX aggregation)
   * 7. Hourly Data: Today's hourly average data (AVERAGE aggregation)
   * 8. Daily Week Data: Last 7 days with 1-day intervals (AVERAGE aggregation)
   * 9. Daily Month Data: Last 30 days with 1-day intervals (AVERAGE aggregation)
   */
  async getCurrentKPIs(deviceUUID: string, debug: boolean = false): Promise<CurrentKPIResponse> {
    const requestedAt = Date.now()

    try {
      // Validate and fetch device
      const device = await this.deviceService.validateDevice(deviceUUID)
      this.logger.info(`[Current] Calculating KPIs for device: ${device.name}`)

      // Calculate time boundaries
      const now = Date.now()
      const timeRanges = this.calculateTimeRanges(now)

      // Log request parameters
      this.logger.debug(`[Current] Time Ranges:`, timeRanges)

      // Batch fetch all telemetry data
      const [
        instantaneousData,
        lastHourMinData,
        lastHourAvgData,
        lastHourMaxData,
        todayAvgData,
        widgetData,
        hourlyData,
        dailyWeekData,
        dailyMonthData,
      ] = await Promise.all([
        // 1. Instantaneous current (last 24h, latest Current_Avg)
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.last24h.start, timeRanges.last24h.end, {
          agg: 'NONE',
          limit: 1,
          orderBy: 'DESC',
        }),

        // 2. Last hour minimum current
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.lastHour.start, timeRanges.lastHour.end, {
          agg: 'MIN',
          interval: timeRanges.lastHour.end - timeRanges.lastHour.start, // Single aggregation for entire hour
        }),

        // 3. Last hour average current
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.lastHour.start, timeRanges.lastHour.end, {
          agg: 'AVG',
          interval: timeRanges.lastHour.end - timeRanges.lastHour.start, // Single aggregation for entire hour
        }),

        // 4. Last hour maximum current (matches ThingsBoard widget configuration)
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.lastHour.start, timeRanges.lastHour.end, {
          agg: 'MAX',
          interval: timeRanges.lastHour.end - timeRanges.lastHour.start, // Single aggregation for entire hour
        }),

        // 5. Today's average current
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.today.start, timeRanges.today.end, {
          agg: 'AVG',
          interval: timeRanges.today.end - timeRanges.today.start, // Single aggregation for entire day
        }),

        // 6. Widget data: Last hour with 15-min intervals (MAX aggregation like ThingsBoard widget)
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.lastHour.start, timeRanges.lastHour.end, {
          agg: 'MAX',
          interval: 15 * 60 * 1000, // 15 minutes
        }),

        // 7. Hourly data: Today's hourly average (AVERAGE aggregation like ThingsBoard chart)
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.today.start, timeRanges.today.end, {
          agg: 'AVG',
          interval: 60 * 60 * 1000, // 1 hour
        }),

        // 8. Daily week data: Last 7 days with 1-day intervals (AVERAGE aggregation)
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.last7days.start, timeRanges.last7days.end, {
          agg: 'AVG',
          interval: 24 * 60 * 60 * 1000, // 1 day
        }),

        // 9. Daily month data: Last 30 days with 1-day intervals (AVERAGE aggregation)
        this.fetchTelemetry(deviceUUID, ['Current_Avg'], timeRanges.last30days.start, timeRanges.last30days.end, {
          agg: 'AVG',
          interval: 24 * 60 * 60 * 1000, // 1 day
        }),
      ])

      // Extract values from responses
      const instantaneousCurrent = this.extractSingleValue(instantaneousData, 'Current_Avg')
      const lastHourMin = this.extractSingleValue(lastHourMinData, 'Current_Avg')
      const lastHourAverage = this.extractSingleValue(lastHourAvgData, 'Current_Avg')
      const lastHourMax = this.extractSingleValue(lastHourMaxData, 'Current_Avg')
      const todayAverage = this.extractSingleValue(todayAvgData, 'Current_Avg')

      // Extract array data
      const widgetDataArray = this.extractTimeseriesData(widgetData, 'Current_Avg')
      const hourlyDataArray = this.extractTimeseriesData(hourlyData, 'Current_Avg')
      const dailyWeekDataArray = this.extractTimeseriesData(dailyWeekData, 'Current_Avg')
      const dailyMonthDataArray = this.extractTimeseriesData(dailyMonthData, 'Current_Avg')

      // Build debug info if requested
      const debugInfo = debug
        ? {
            requests: [
              {
                id: 'instantaneous',
                keys: ['Current_Avg'],
                startTs: timeRanges.last24h.start,
                endTs: timeRanges.last24h.end,
                agg: 'NONE',
                limit: 1,
                resultPoints: 1,
              },
              {
                id: 'lastHourMin',
                keys: ['Current_Avg'],
                startTs: timeRanges.lastHour.start,
                endTs: timeRanges.lastHour.end,
                agg: 'MIN',
                resultPoints: 1,
              },
              {
                id: 'lastHourAvg',
                keys: ['Current_Avg'],
                startTs: timeRanges.lastHour.start,
                endTs: timeRanges.lastHour.end,
                agg: 'AVG',
                resultPoints: 1,
              },
              {
                id: 'lastHourMax',
                keys: ['Current_Avg'],
                startTs: timeRanges.lastHour.start,
                endTs: timeRanges.lastHour.end,
                agg: 'MAX',
                resultPoints: 1,
              },
              {
                id: 'todayAvg',
                keys: ['Current_Avg'],
                startTs: timeRanges.today.start,
                endTs: timeRanges.today.end,
                agg: 'AVG',
                resultPoints: 1,
              },
              {
                id: 'widgetData',
                keys: ['Current_Avg'],
                startTs: timeRanges.lastHour.start,
                endTs: timeRanges.lastHour.end,
                interval: 15 * 60 * 1000,
                agg: 'MAX',
                resultPoints: widgetDataArray.length,
              },
              {
                id: 'hourlyData',
                keys: ['Current_Avg'],
                startTs: timeRanges.today.start,
                endTs: timeRanges.today.end,
                interval: 60 * 60 * 1000,
                agg: 'AVG',
                resultPoints: hourlyDataArray.length,
              },
              {
                id: 'dailyWeekData',
                keys: ['Current_Avg'],
                startTs: timeRanges.last7days.start,
                endTs: timeRanges.last7days.end,
                interval: 24 * 60 * 60 * 1000,
                agg: 'AVG',
                resultPoints: dailyWeekDataArray.length,
              },
              {
                id: 'dailyMonthData',
                keys: ['Current_Avg'],
                startTs: timeRanges.last30days.start,
                endTs: timeRanges.last30days.end,
                interval: 24 * 60 * 60 * 1000,
                agg: 'AVG',
                resultPoints: dailyMonthDataArray.length,
              },
            ],
          }
        : undefined

      this.logger.info(`[Current] KPIs calculated:`, {
        instantaneousCurrent,
        lastHourMin,
        lastHourAverage,
        lastHourMax,
        todayAverage,
        widgetDataPoints: widgetDataArray.length,
        hourlyDataPoints: hourlyDataArray.length,
        dailyWeekDataPoints: dailyWeekDataArray.length,
        dailyMonthDataPoints: dailyMonthDataArray.length,
      })

      return {
        success: true,
        data: {
          instantaneousCurrent,
          lastHourMin,
          lastHourAverage,
          lastHourMax,
          todayAverage,
          hourlyData: hourlyDataArray,
          widgetData: widgetDataArray,
          dailyWeekData: dailyWeekDataArray,
          dailyMonthData: dailyMonthDataArray,
        },
        meta: {
          deviceUUID,
          deviceName: device.name || 'Unknown Device',
          requestedAt,
        },
        ...(debugInfo && { debug: debugInfo }),
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Current] KPI calculation failed: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Calculate time boundaries for different time ranges
   */
  private calculateTimeRanges(now: number) {
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

    return {
      today: {
        start: todayStartTs,
        end: now,
      },
      lastHour: {
        start: lastHourStart,
        end: lastHourEnd,
      },
      last24h: {
        start: last24hStart,
        end: last24hEnd,
      },
      last7days: {
        start: last7daysStart,
        end: last7daysEnd,
      },
      last30days: {
        start: last30daysStart,
        end: last30daysEnd,
      },
    }
  }

  /**
   * Fetch telemetry data from ThingsBoard
   */
  private async fetchTelemetry(
    deviceUUID: string,
    keys: string[],
    startTs: number,
    endTs: number,
    options?: {
      agg?: string
      interval?: number
      limit?: number
      orderBy?: string
    }
  ) {
    try {
      const data = await this.telemetryService.getTimeseries(
        'DEVICE',
        deviceUUID,
        keys,
        startTs,
        endTs,
        options?.interval,
        options?.agg,
        options?.orderBy,
        options?.limit
      )

      this.logger.debug(`[Current] Fetched telemetry:`, {
        keys,
        agg: options?.agg,
        interval: options?.interval,
        dataPoints: Object.values(data).reduce((sum, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
      })

      return data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Current] Telemetry fetch failed: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Extract a single numeric value from telemetry response
   */
  private extractSingleValue(data: any, key: string): number | null {
    if (!data || !data[key] || !Array.isArray(data[key]) || data[key].length === 0) {
      return null
    }

    const value = parseFloat(data[key][0].value)
    return isNaN(value) ? null : value
  }

  /**
   * Extract timeseries array from telemetry response
   */
  private extractTimeseriesData(data: any, key: string): Array<{ ts: number; value: number }> {
    if (!data || !data[key] || !Array.isArray(data[key])) {
      return []
    }

    return data[key]
      .map((point: any) => ({
        ts: point.ts,
        value: parseFloat(point.value),
      }))
      .filter((point: any) => !isNaN(point.value))
  }
}
