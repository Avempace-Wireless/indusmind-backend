import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from '../services/thingsboard/thingsboard-telemetry.service.js'
import { DeviceService } from '../services/device.service.js'

const globalMetersLogger = logger.child({ module: 'GlobalMetersService' })

/**
 * Global Meter Data for single meter
 * Returned for each meter in the batch response
 */
export interface GlobalMeterData {
  deviceUUID: string
  name: string
  status: 'online' | 'offline'
  instantaneous: number | null // Current power in kW
  today: number | null // Today's consumption in kWh
  yesterday: number | null // Yesterday's consumption in kWh
  hourlyData: Array<{ ts: number; value: number }> // Today's hourly consumption
  monthlyData: Array<{ ts: number; value: number }> // This month's daily consumption
  yearlyData: Array<{ ts: number; value: number }> // Last year's daily average consumption
}

export interface GlobalMetersResponse {
  success: boolean
  data: GlobalMeterData[]
  meta: {
    count: number
    requestedAt: number
  }
}

/**
 * Global Meters Service
 * Handles fetching telemetry data for multiple meters simultaneously
 * Used by the Global Meters View for factory display
 */
export class GlobalMetersService {
  private logger = globalMetersLogger

  constructor(
    private telemetryService: ThingsboardTelemetryService,
    private deviceService: DeviceService
  ) {}

  /**
   * Get all Global Meters data for multiple devices
   * Fetches instantaneous power, today/yesterday energy, and chart data in parallel
   */
  async getGlobalMetersData(deviceUUIDs: string[], debug: boolean = false): Promise<GlobalMetersResponse> {
    const requestedAt = Date.now()

    try {
      if (!deviceUUIDs || deviceUUIDs.length === 0) {
        return {
          success: true,
          data: [],
          meta: {
            count: 0,
            requestedAt,
          },
        }
      }

      this.logger.info(`[GlobalMeters] Fetching data for ${deviceUUIDs.length} devices`)

      // Fetch data for all devices in parallel
      const promises = deviceUUIDs.map(uuid => this.getDeviceMetersData(uuid, debug))
      const results = await Promise.allSettled(promises)

      // Process results
      const successfulData: GlobalMeterData[] = []

      for (let i = 0; i < results.length; i++) {
        const result = results[i]

        if (result.status === 'fulfilled' && result.value) {
          successfulData.push(result.value)
        } else {
          const error = result.status === 'rejected' ? result.reason : 'Unknown error'
          this.logger.warn(`[GlobalMeters] Failed to fetch data for device ${deviceUUIDs[i]}: ${error}`)
        }
      }

      const response: GlobalMetersResponse = {
        success: true,
        data: successfulData,
        meta: {
          count: successfulData.length,
          requestedAt,
        },
      }

      if (debug) {
        this.logger.info(`[GlobalMeters] Fetched data for ${successfulData.length} devices`, {
          requested: deviceUUIDs.length,
          success: successfulData.length,
        })
      }

      return response
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[GlobalMeters] Failed to fetch global meters data: ${errorMsg}`, { error })

      return {
        success: false,
        data: [],
        meta: {
          count: 0,
          requestedAt,
        },
      }
    }
  }

  /**
   * Get meter data for a single device
   */
  private async getDeviceMetersData(deviceUUID: string, debug: boolean = false): Promise<GlobalMeterData | null> {
    try {
      // Validate device exists
      const device = await this.deviceService.validateDevice(deviceUUID)
      this.logger.debug(`[GlobalMeters] Processing device: ${device.name}`)

      // Calculate time boundaries
      const now = Date.now()
      const timeRanges = this.calculateTimeRanges(now)

      // Fetch all telemetry data in parallel
      const [instantaneousData, todayData, yesterdayData, todayHourlyData, last7DaysData, lastYearData] = await Promise.all([
        // 1. Instantaneous power (latest ActivePowerTotal)
        this.fetchTelemetry(deviceUUID, ['ActivePowerTotal'], timeRanges.last24h.start, timeRanges.last24h.end, {
          agg: 'NONE',
          limit: 1,
          orderBy: 'DESC',
        }),

        // 2. Consumed today (deltaHourEnergyConsumtion, SUM, today)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.today.start, timeRanges.today.end, {
          interval: 300000, // 5 minutes
          agg: 'SUM',
          limit: 10000,
        }),

        // 3. Consumed yesterday (deltaHourEnergyConsumtion, SUM, yesterday)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.yesterday.start, timeRanges.yesterday.end, {
          interval: 3600000, // 1 hour
          agg: 'SUM',
          limit: 24,
        }),

        // 4. Today's hourly chart (deltaHourEnergyConsumtion, SUM, 1h intervals)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.today.start, timeRanges.today.end, {
          interval: 3600000, // 1 hour
          agg: 'SUM',
          limit: 24,
          orderBy: 'ASC',
        }),

        // 5. Last 7 days daily chart (deltaHourEnergyConsumtion, SUM, 1 day intervals)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.last7Days.start, timeRanges.last7Days.end, {
          interval: 86400000, // 1 day
          agg: 'SUM',
          limit: 7,
          orderBy: 'ASC',
        }),

        // 6. Last year daily average chart (deltaHourEnergyConsumtion, AVG, 1 day intervals)
        this.fetchTelemetry(deviceUUID, ['deltaHourEnergyConsumtion'], timeRanges.lastYear.start, timeRanges.lastYear.end, {
          interval: 86400000, // 1 day
          agg: 'AVG',
          limit: 365,
          orderBy: 'ASC',
        }),
      ])

      // Extract values
      const instantaneous = this.extractInstantaneousPower(instantaneousData)
      const today = this.extractAggregatedConsumption(todayData)
      const yesterday = this.extractAggregatedConsumption(yesterdayData)
      const hourlyData = this.extractChartData(todayHourlyData)
      const monthlyData = this.extractChartData(last7DaysData)
      const yearlyData = this.extractChartData(lastYearData)

      // Determine device status (online if has recent data, offline otherwise)
      const status = instantaneous !== null ? 'online' : 'offline'

      return {
        deviceUUID,
        name: device.name || 'Unknown Device',
        status,
        instantaneous,
        today,
        yesterday,
        hourlyData,
        monthlyData,
        yearlyData,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.warn(`[GlobalMeters] Error processing device ${deviceUUID}: ${errorMsg}`)
      return null
    }
  }

  /**
   * Calculate time boundaries for all requests
   */
  private calculateTimeRanges(now: number) {
    // Today's start (midnight UTC)
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)

    // Yesterday's start and end
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

    // Last 7 days start
    const last7DaysStart = new Date(todayStart)
    last7DaysStart.setUTCDate(last7DaysStart.getUTCDate() - 7)

    // Last year (365 days ago)
    const lastYearStart = new Date(todayStart)
    lastYearStart.setUTCDate(lastYearStart.getUTCDate() - 365)

    return {
      last24h: {
        start: now - 86400000, // 24 hours ago
        end: now,
      },
      yesterday: {
        start: yesterdayStart.getTime(),
        end: todayStart.getTime(),
      },
      today: {
        start: todayStart.getTime(),
        end: now,
      },
      last7Days: {
        start: last7DaysStart.getTime(),
        end: now,
      },
      lastYear: {
        start: lastYearStart.getTime(),
        end: now,
      },
    }
  }

  /**
   * Fetch telemetry from ThingsBoard
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
        options?.agg,
        options?.orderBy,
        options?.limit
      )

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.warn(`[GlobalMeters] Telemetry fetch failed for device ${deviceUUID}: ${errorMsg}`)
      return keys.reduce((acc, key) => ({ ...acc, [key]: [] }), {} as Record<string, any[]>)
    }
  }

  /**
   * Extract instantaneous power (latest ActivePowerTotal)
   */
  private extractInstantaneousPower(data: Record<string, any[]>): number | null {
    const powerData = data.ActivePowerTotal || []
    if (powerData.length === 0) return null
    const value = parseFloat(powerData[powerData.length - 1].value)
    return !isNaN(value) ? value : null
  }

  /**
   * Extract aggregated consumption sum
   */
  private extractAggregatedConsumption(data: Record<string, any[]>): number | null {
    const consumptionData = data.deltaHourEnergyConsumtion || []
    if (consumptionData.length === 0) return null

    const total = consumptionData.reduce((sum, d) => {
      const value = parseFloat(d.value) || 0
      return sum + value
    }, 0)

    return total > 0 ? total : null
  }

  /**
   * Extract chart data from aggregated telemetry
   */
  private extractChartData(data: Record<string, any[]>): Array<{ ts: number; value: number }> {
    const chartData = data.deltaHourEnergyConsumtion || []
    if (chartData.length === 0) return []

    return chartData.map((d) => ({
      ts: d.ts,
      value: parseFloat(d.value) || 0,
    }))
  }

  /**
   * Get temperature chart data for sensors (24 hours)
   * Fetches temperature data from T_Sensor devices for the last 24 hours
   */
  async getTemperatureChartData(
    sensorIds?: string[]
  ): Promise<{
    success: boolean
    data: {
      sensors: Array<{
        deviceUUID: string
        sensorLabel: string
        sensorName: string
        data: Array<{
          timestamp: number
          value: number
          readableDate: string
        }>
      }>
    }
  }> {
    try {
      // Calculate 24-hour window
      const now = Date.now()
      const startTs = now - 24 * 60 * 60 * 1000 // 24 hours ago
      const endTs = now
      const interval = 60 * 60 * 1000 // 1 hour intervals

      this.logger.info(`[GlobalMeters] Fetching temperature chart data for 24 hours`)

      // Get all devices
      const allDevices = await this.deviceService.getDevices()
      const temperatureSensors = allDevices.filter(
        (d: any) => d.name?.includes('T_Sensor') || d.name?.includes('Indusmind_T_Sensor')
      )

      if (temperatureSensors.length === 0) {
        return {
          success: true,
          data: { sensors: [] },
        }
      }

      // Filter by sensorIds if provided
      const sensorsToFetch = sensorIds
        ? temperatureSensors.filter((d: any) => sensorIds.includes(d.deviceUUID))
        : temperatureSensors

      this.logger.info(`[GlobalMeters] Fetching temperature data for ${sensorsToFetch.length} sensors`)

      // Fetch temperature data for each sensor
      const chartDataPromises = sensorsToFetch.map(async (device: any) => {
        try {
          const telemetryResult = await this.telemetryService.getTimeseries(
            'DEVICE',
            device.deviceUUID,
            ['Temperature'],
            startTs,
            endTs,
            interval,
            'AVG',
            'ASC',
            25
          )

          const temperatureData = telemetryResult?.Temperature || []

          const formattedData = temperatureData.map((point: any) => {
            const date = new Date(point.ts)
            return {
              timestamp: point.ts,
              value: parseFloat(point.value) || 0,
              readableDate: date.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            }
          })

          return {
            deviceUUID: device.deviceUUID,
            sensorLabel: device.label || device.name,
            sensorName: device.name,
            data: formattedData,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          this.logger.warn(`[GlobalMeters] Failed to fetch temperature data for ${device.name}: ${errorMsg}`)
          return {
            deviceUUID: device.deviceUUID,
            sensorLabel: device.label || device.name,
            sensorName: device.name,
            data: [],
          }
        }
      })

      const sensorsChartData = await Promise.all(chartDataPromises)

      return {
        success: true,
        data: {
          sensors: sensorsChartData,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[GlobalMeters] Failed to fetch temperature chart data: ${errorMsg}`)
      return {
        success: false,
        data: { sensors: [] },
      }
    }
  }
}
