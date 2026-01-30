/**
 * EnergyHistoryService - Centralized Energy History Data Fetching
 *
 * Provides all telemetry data needed for the EnergyHistorical view:
 * - Multiple metrics (energy, CO2, cost, consumption)
 * - Date range queries with hourly/daily resolution
 * - Multiple device comparison
 * - Aggregation and transformation
 */

import { ThingsboardTelemetryService } from './thingsboard/thingsboard-telemetry.service.js'

interface EnergyHistoryQuery {
  deviceUUIDList: string[]
  startDate: number // Unix timestamp in ms
  endDate: number // Unix timestamp in ms
  metricTypes: ('energy' | 'co2' | 'cost' | 'consumption')[]
  resolution: 'hourly' | 'daily'
  hourFrom?: number // 0-23, optional filter
  hourTo?: number // 0-23, optional filter
}

interface EnergyHistoryResponse {
  success: boolean
  data: {
    [deviceUUID: string]: {
      [metricType: string]: Array<{
        timestamp: number
        value: number
        hasData: boolean
      }>
    }
  }
  meta: {
    deviceUUIDs: string[]
    metricTypes: string[]
    resolution: 'hourly' | 'daily'
    startDate: number
    endDate: number
    requestedAt: number
  }
  debug?: {
    requests: Array<{
      deviceUUID: string
      metricType: string
      telemetryKeys: string[]
      resultPoints: number
    }>
  }
}

/**
 * Telemetry key mappings for different metrics
 */
const METRIC_TELEMETRY_KEYS: Record<string, string[]> = {
  energy: ['ActiveEnergy', 'AccumulatedActiveEnergyDelivered'],
  co2: ['CO2Emissions', 'CO2Intensity'],
  cost: ['EnergyCost', 'CostPerKWh'],
  consumption: ['ActivePowerTotal', 'deltaHourEnergyConsumtion', 'deltaDayEnergyConsumtion']
}

/**
 * Aggregation methods for each metric type
 */
const METRIC_AGGREGATIONS: Record<string, 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'NONE'> = {
  energy: 'SUM',
  co2: 'SUM',
  cost: 'SUM',
  consumption: 'SUM'
}

/**
 * Time intervals for different resolutions
 */
const RESOLUTION_INTERVALS: Record<'hourly' | 'daily', number> = {
  hourly: 3600000, // 1 hour in ms
  daily: 86400000 // 1 day in ms
}

export class EnergyHistoryService {
  private logger = {
    debug: (msg: string, data?: any) => console.log('[EnergyHistoryService]', msg, data || ''),
    warn: (msg: string, error?: any) => console.warn('[EnergyHistoryService]', msg, error || ''),
    error: (msg: string, error?: any) => console.error('[EnergyHistoryService]', msg, error || '')
  }

  constructor(private telemetryService: ThingsboardTelemetryService) {}

  /**
   * Fetch energy history data for multiple devices and metrics
   */
  async getEnergyHistory(query: EnergyHistoryQuery): Promise<EnergyHistoryResponse> {
    const startTime = Date.now()

    try {
      this.logger.debug(`Fetching energy history for devices: ${query.deviceUUIDList.join(', ')}`)
      this.logger.debug(`Metrics: ${query.metricTypes.join(', ')}`)
      this.logger.debug(`Range: ${new Date(query.startDate).toISOString()} to ${new Date(query.endDate).toISOString()}`)

      // Build all required requests
      const allRequests = this.buildDataRequests(query)

      // Execute all requests in parallel
      const requestPromises = allRequests.map(req => this.executeRequest(req))
      const requestResults = await Promise.all(requestPromises)

      // Transform results into metric-organized structure
      const transformedData = this.transformResults(query, requestResults)

      // Apply optional time filtering
      if (query.hourFrom !== undefined || query.hourTo !== undefined) {
        this.filterByHourRange(transformedData, query.hourFrom || 0, query.hourTo || 23)
      }

      return {
        success: true,
        data: transformedData,
        meta: {
          deviceUUIDs: query.deviceUUIDList,
          metricTypes: query.metricTypes,
          resolution: query.resolution,
          startDate: query.startDate,
          endDate: query.endDate,
          requestedAt: Date.now()
        },
        debug: {
          requests: allRequests.map((req, idx) => {
            const result = requestResults[idx] || {}
            const totalPoints = Object.values(result).reduce((sum: number, points: any[]) => sum + (Array.isArray(points) ? points.length : 0), 0)
            return {
              deviceUUID: req.deviceUUID,
              metricType: req.metricType,
              telemetryKeys: req.telemetryKeys,
              resultPoints: totalPoints
            }
          })
        }
      }
    } catch (error) {
      this.logger.error('Error fetching energy history:', error)
      throw error
    }
  }

  /**
   * Build individual data requests for all device-metric combinations
   */
  private buildDataRequests(query: EnergyHistoryQuery) {
    const requests = []

    for (const deviceUUID of query.deviceUUIDList) {
      for (const metricType of query.metricTypes) {
        const telemetryKeys = METRIC_TELEMETRY_KEYS[metricType] || []
        const aggregation = METRIC_AGGREGATIONS[metricType] || 'SUM'
        const interval = RESOLUTION_INTERVALS[query.resolution]

        requests.push({
          deviceUUID,
          metricType,
          telemetryKeys,
          startDate: query.startDate,
          endDate: query.endDate,
          interval,
          aggregation
        })
      }
    }

    return requests
  }

  /**
   * Execute a single telemetry request
   */
  private async executeRequest(req: {
    deviceUUID: string
    metricType: string
    telemetryKeys: string[]
    startDate: number
    endDate: number
    interval: number
    aggregation: string
  }) {
    try {
      this.logger.debug(`Fetching ${req.metricType} for device ${req.deviceUUID}`)
      
      // Fetch raw data without aggregation first (API works better this way)
      // ThingsBoard will return all data points, then we can aggregate locally if needed
      const result = await this.telemetryService.getTimeseries(
        'DEVICE',
        req.deviceUUID,
        req.telemetryKeys,
        req.startDate,
        req.endDate,
        undefined, // Don't pass interval to get raw data
        undefined, // Don't pass agg, let API return all points
        'ASC',
        undefined,
        false
      )

      this.logger.debug(`Successfully fetched ${req.metricType}:`, {
        keys: req.telemetryKeys.join(','),
        resultPoints: Object.values(result).reduce((sum, arr: any[]) => sum + arr.length, 0),
      })

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Failed to fetch ${req.metricType} for device ${req.deviceUUID}: ${errorMsg}`)
      return req.telemetryKeys.reduce((acc, key) => ({ ...acc, [key]: [] }), {} as Record<string, any[]>)
    }
  }

  /**
   * Transform raw telemetry results into metric-organized structure
   */
  private transformResults(
    query: EnergyHistoryQuery,
    results: any[]
  ): EnergyHistoryResponse['data'] {
    const data: EnergyHistoryResponse['data'] = {}

    // Initialize structure
    for (const deviceUUID of query.deviceUUIDList) {
      data[deviceUUID] = {}
      for (const metricType of query.metricTypes) {
        data[deviceUUID][metricType] = []
      }
    }

    // Fill in the data - results is array of Record<string, any[]> from telemetry calls
    let resultIndex = 0
    for (const deviceUUID of query.deviceUUIDList) {
      for (const metricType of query.metricTypes) {
        const telemetryKeys = METRIC_TELEMETRY_KEYS[metricType] || []
        const rawResult = results[resultIndex] || {} // This is {key: [dataPoints]}
        resultIndex++

        this.logger.debug(`Processing ${metricType} for device ${deviceUUID}`, {
          telemetryKeys,
          resultKeys: Object.keys(rawResult),
          resultIndex: resultIndex - 1
        })

        // Combine all telemetry keys' data for this metric
        const combinedDataPoints: any[] = []
        
        for (const key of telemetryKeys) {
          const keyDataPoints = rawResult[key] || []
          this.logger.debug(`Key ${key}: ${keyDataPoints.length} data points`)
          combinedDataPoints.push(...keyDataPoints)
        }

        // Sort by timestamp
        combinedDataPoints.sort((a, b) => a.ts - b.ts)

        // Transform raw data points
        const transformedPoints = this.transformDataPoints(
          combinedDataPoints,
          metricType,
          query.resolution
        )

        this.logger.debug(`Transformed ${metricType}: ${transformedPoints.length} points`)

        data[deviceUUID][metricType] = transformedPoints
      }
    }

    return data
  }

  /**
   * Transform raw telemetry data points
   */
  private transformDataPoints(
    rawPoints: any[],
    metricType: string,
    resolution: 'hourly' | 'daily'
  ) {
    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
      return []
    }

    return rawPoints.map(point => ({
      timestamp: point.ts || point.timestamp || Date.now(),
      value: parseFloat(point.value) || 0,
      hasData: true
    }))
  }

  /**
   * Filter data by hour range (keep only specific hours of each day)
   */
  private filterByHourRange(
    data: EnergyHistoryResponse['data'],
    hourFrom: number,
    hourTo: number
  ) {
    for (const deviceUUID in data) {
      for (const metricType in data[deviceUUID]) {
        data[deviceUUID][metricType] = data[deviceUUID][metricType].filter(point => {
          const date = new Date(point.timestamp)
          const hour = date.getHours()
          return hour >= hourFrom && hour <= hourTo
        })
      }
    }
  }

  /**
   * Get available metrics for a device
   */
  async getAvailableMetrics(deviceUUID: string) {
    return {
      energy: {
        available: true,
        keys: METRIC_TELEMETRY_KEYS.energy,
        aggregation: METRIC_AGGREGATIONS.energy
      },
      co2: {
        available: true,
        keys: METRIC_TELEMETRY_KEYS.co2,
        aggregation: METRIC_AGGREGATIONS.co2
      },
      cost: {
        available: true,
        keys: METRIC_TELEMETRY_KEYS.cost,
        aggregation: METRIC_AGGREGATIONS.cost
      },
      consumption: {
        available: true,
        keys: METRIC_TELEMETRY_KEYS.consumption,
        aggregation: METRIC_AGGREGATIONS.consumption
      }
    }
  }
}
