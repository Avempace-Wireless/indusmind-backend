import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from './thingsboard/thingsboard-telemetry.service.js'
import { DeviceService } from './device.service.js'

const puissanceLogger = logger.child({ module: 'PuissanceService' })

/**
 * Puissance KPI values response
 */
export interface PuissanceKPIResponse {
  success: boolean
  data: {
    // Instantaneous values
    instantaneousPower: number | null // Latest ActivePowerTotal in kW

    // Hourly consumption
    consumedThisHour: number | null // Latest deltaHourEnergyConsumtion in kWh

    // Daily consumption
    consumedToday: number | null // Today's total in kWh
    consumedYesterday: number | null // Yesterday's total in kWh

    // Monthly consumption
    consumedThisMonth: number | null // This month total in kWh
    consumedLastMonth: number | null // Last month total in kWh

    // Chart data
    hourlyData: Array<{ ts: number; value: number }> // Today's hourly consumption
    dailyData: Array<{ ts: number; value: number }> // This month's daily consumption
    monthlyData: Array<{ ts: number; value: number }> // Last 12 months' monthly consumption
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
 * Puissance Service
 * Handles fetching and calculating all values needed for the Puissance view
 */
export class PuissanceService {
  private logger = puissanceLogger

  constructor(
    private telemetryService: ThingsboardTelemetryService,
    private deviceService: DeviceService
  ) {}

  /**
   * Get all Puissance KPI values for a device
   * Makes optimized batch requests to ThingsBoard for all needed telemetry
   */
  async getPuissanceKPIs(deviceUUID: string, debug: boolean = false): Promise<PuissanceKPIResponse> {
    const requestedAt = Date.now()

    try {
      // Validate and fetch device
      const device = await this.deviceService.validateDevice(deviceUUID)
      this.logger.info(`[Puissance] Calculating KPIs for device: ${device.name}`)

      // Calculate time boundaries
      const now = Date.now()
      const timeRanges = this.calculateTimeRanges(now)

      // Log request parameters
      this.logger.debug(`[Puissance] Time Ranges:`, timeRanges)

      // Batch fetch all telemetry data using ThingsBoard dashboard parameters
      const [
        instantaneousData,
        thisHourData,
        todayData,
        yesterdayData,
        thisMonthData,
        lastMonthData,
        todayHourlyData,
        thisMonthDailyData,
        yearlyMonthlyData,
      ] = await Promise.all([
        // 1. Instantaneous power (last 24h, latest ActivePowerTotal)
        this.fetchTelemetry(deviceUUID, ['ActivePowerTotal'], timeRanges.last24h.start, timeRanges.last24h.end, {
          agg: 'NONE',
          limit: 1,
          orderBy: 'DESC',
        }),

        // 2. Consumed this hour (deltaHourEnergyConsumtion, aggregation: SUM, interval: 10 minutes, current hour)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.last1h.start, timeRanges.last1h.end, {
          interval: 600000, // 10 minutes
          agg: 'SUM',
          limit: 10,
          orderBy: 'ASC',
        }),

        // 3. Consumed today (deltaHourEnergyConsumtion, aggregation: SUM, interval: 5 minutes, current day)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.today.start, timeRanges.today.end, {
          interval: 300000, // 5 minutes
          agg: 'SUM',
          limit: 10000,
          orderBy: 'ASC',
        }),

        // 4. Consumed yesterday (deltaHourEnergyConsumtion, aggregation: SUM, interval: 1 hour, yesterday)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.yesterday.start, timeRanges.yesterday.end, {
          interval: 3600000, // 1 hour
          agg: 'SUM',
          limit: 24,
          orderBy: 'ASC',
        }),

        // 5. Consumed this month (deltaHourEnergyConsumtion, aggregation: SUM, interval: 2 hours, current month)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.thisMonth.start, timeRanges.thisMonth.end, {
          interval: 7200000, // 2 hours
          agg: 'SUM',
          limit: 10000,
          orderBy: 'ASC',
        }),

        // 6. Consumed last month (deltaHourEnergyConsumtion, aggregation: SUM, interval: 2 hours, previous month)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.lastMonth.start, timeRanges.lastMonth.end, {
          interval: 7200000, // 2 hours
          agg: 'SUM',
          limit: 10000,
          orderBy: 'ASC',
        }),

        // 7. Today's chart data (deltaHourEnergyConsumtion, aggregation: SUM, interval: 59m59s custom, current day)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.today.start, timeRanges.today.end, {
          interval: 3599000, // 59 minutes 59 seconds (59m59s)
          agg: 'SUM',
          limit: 10000,
          orderBy: 'ASC',
        }),

        // 8. This month's daily chart (deltaHourEnergyConsumtion, aggregation: SUM, interval: 1 day, current month)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.thisMonth.start, timeRanges.thisMonth.end, {
          interval: 86400000, // 1 day
          agg: 'SUM',
          limit: 31,
          orderBy: 'ASC',
        }),

        // 9. Last 12 months' monthly data (deltaHourEnergyConsumtion, aggregation: SUM, interval: 1 month, last 12 months)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.last12Months.start, timeRanges.last12Months.end, {
          interval: 2592000000, // ~30 days (1 month average)
          agg: 'SUM',
          limit: 12,
          orderBy: 'ASC',
        }),
      ])

      // Calculate KPI values from fetched data
      const instantaneousPower = this.extractInstantaneousPower(instantaneousData)
      const consumedThisHour = this.extractAggregatedConsumption(thisHourData)
      const consumedToday = this.extractAggregatedConsumption(todayData)
      const consumedYesterday = this.extractAggregatedConsumption(yesterdayData)
      const consumedThisMonth = this.extractAggregatedConsumption(thisMonthData)
      const consumedLastMonth = this.extractAggregatedConsumption(lastMonthData)

      // Calculate chart data
      const hourlyData = this.extractAggregatedChartData(todayHourlyData)
      const dailyData = this.extractAggregatedChartData(thisMonthDailyData)
      const monthlyData = this.extractAggregatedChartData(yearlyMonthlyData)

      const response: PuissanceKPIResponse = {
        success: true,
        data: {
          instantaneousPower,
          consumedThisHour,
          consumedToday,
          consumedYesterday,
          consumedThisMonth,
          consumedLastMonth,
          hourlyData,
          dailyData,
          monthlyData,
        },
        meta: {
          deviceUUID,
          deviceName: device.name || 'Unknown',
          requestedAt,
        },
      }

      if (debug) {
        response.debug = {
          requests: [
            { id: 'instantaneous', keys: ['ActivePowerTotal'], startTs: timeRanges.last24h.start, endTs: timeRanges.last24h.end, resultPoints: (instantaneousData.ActivePowerTotal as any[])?.length || 0 },
            { id: 'thisHour', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.last1h.start, endTs: timeRanges.last1h.end, resultPoints: (thisHourData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'today', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.today.start, endTs: timeRanges.today.end, resultPoints: (todayData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'yesterday', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.yesterday.start, endTs: timeRanges.yesterday.end, resultPoints: (yesterdayData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'thisMonth', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.thisMonth.start, endTs: timeRanges.thisMonth.end, resultPoints: (thisMonthData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'lastMonth', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.lastMonth.start, endTs: timeRanges.lastMonth.end, resultPoints: (lastMonthData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'todayHourly', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.today.start, endTs: timeRanges.today.end, interval: 3599000, resultPoints: (todayHourlyData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'thisMonthDaily', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.thisMonth.start, endTs: timeRanges.thisMonth.end, interval: 86400000, resultPoints: (thisMonthDailyData.deltaHourEnergyConsumtion as any[])?.length || 0 },
            { id: 'yearlyMonthly', keys: ['deltaHourEnergyConsumtion'], startTs: timeRanges.last12Months.start, endTs: timeRanges.last12Months.end, interval: 2592000000, resultPoints: (yearlyMonthlyData.deltaHourEnergyConsumtion as any[])?.length || 0 },
          ],
        }
      }

      this.logger.info(`[Puissance] KPIs calculated successfully:`, {
        instantaneousPower,
        consumedThisHour,
        consumedToday,
        consumedYesterday,
        consumedThisMonth,
        consumedLastMonth,
      })

      return response
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Puissance] Failed to calculate KPIs: ${errorMsg}`, { deviceUUID, error })

      return {
        success: false,
        data: {
          instantaneousPower: null,
          consumedThisHour: null,
          consumedToday: null,
          consumedYesterday: null,
          consumedThisMonth: null,
          consumedLastMonth: null,
          hourlyData: [],
          dailyData: [],
          monthlyData: [],
        },
        meta: {
          deviceUUID,
          deviceName: 'Unknown',
          requestedAt,
        },
      }
    }
  }

  /**
   * Calculate time boundaries for all telemetry requests
   */
  private calculateTimeRanges(now: number) {
    // Today's start (midnight UTC)
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)

    // Yesterday's start and end
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

    // This month's start
    const thisMonthStart = new Date(now)
    thisMonthStart.setUTCDate(1)
    thisMonthStart.setUTCHours(0, 0, 0, 0)

    // Last month's start and end
    const lastMonthStart = new Date(thisMonthStart)
    lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1)

    const lastMonthEnd = new Date(thisMonthStart)
    lastMonthEnd.setUTCDate(0)
    lastMonthEnd.setUTCHours(23, 59, 59, 999)

    // Last 12 months start
    const last12MonthsStart = new Date(thisMonthStart)
    last12MonthsStart.setUTCMonth(last12MonthsStart.getUTCMonth() - 12)

    return {
      last1h: {
        start: now - 3600000, // 1 hour ago
        end: now,
      },
      last24h: {
        start: now - 86400000, // 24 hours ago
        end: now,
      },
      today: {
        start: todayStart.getTime(),
        end: now,
      },
      yesterday: {
        start: yesterdayStart.getTime(),
        end: todayStart.getTime(),
      },
      thisMonth: {
        start: thisMonthStart.getTime(),
        end: now,
      },
      lastMonth: {
        start: lastMonthStart.getTime(),
        end: lastMonthEnd.getTime(),
      },
      last12Months: {
        start: last12MonthsStart.getTime(),
        end: now,
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
      interval?: number
      agg?: string
      orderBy?: string
      limit?: number
    }
  ): Promise<Record<string, any[]>> {
    try {
      const result = await this.telemetryService.getTimeseries(
        'DEVICE',
        deviceUUID,
        keys,
        startTs,
        endTs,
        options?.interval,
        options?.agg || undefined,
        options?.orderBy || undefined,
        options?.limit,
        undefined
      )

      this.logger.debug(`[Puissance] Fetched telemetry:`, {
        keys: keys.join(','),
        resultPoints: Object.values(result).reduce((sum, arr: any[]) => sum + arr.length, 0),
      })

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.warn(`[Puissance] Telemetry fetch failed for keys ${keys.join(',')}: ${errorMsg}`)
      return keys.reduce((acc, key) => ({ ...acc, [key]: [] }), {} as Record<string, any[]>)
    }
  }

  /**
   * Extract instantaneous power (latest ActivePowerTotal)
   */
  private extractInstantaneousPower(data: Record<string, any[]>): number | null {
    const powerData = data.ActivePowerTotal || []
    if (powerData.length === 0) return null
    return parseFloat(powerData[powerData.length - 1].value) || null
  }

  /**
   * Extract aggregated consumption sum from SUM-aggregated data
   * For deltaHourEnergyConsumtion with SUM aggregation
   */
  private extractAggregatedConsumption(data: Record<string, any[]>): number | null {
    const consumptionData = data.deltaHourEnergyConsumtion || []
    if (consumptionData.length === 0) return null

    // Sum all values from SUM-aggregated intervals
    const total = consumptionData.reduce((sum, d) => {
      const value = parseFloat(d.value) || 0
      return sum + value
    }, 0)

    return total > 0 ? total : null
  }

  /**
   * Extract chart data from SUM-aggregated consumption data
   * Already aggregated by ThingsBoard, just extract and format
   */
  private extractAggregatedChartData(
    data: Record<string, any[]>
  ): Array<{ ts: number; value: number }> {
    const chartData = data.deltaHourEnergyConsumtion || []
    if (chartData.length === 0) return []

    return chartData.map((d) => ({
      ts: d.ts,
      value: parseFloat(d.value) || 0,
    }))
  }
}
