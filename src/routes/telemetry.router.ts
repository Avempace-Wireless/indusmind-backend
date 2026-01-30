import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from '../services/thingsboard/thingsboard-telemetry.service.js'
import { ThingsboardAuthService } from '../services/thingsboard/thingsboard-auth.service.js'
import { DeviceService } from '../services/device.service.js'
import { KPICalculatorService } from '../services/kpi-calculator.service.js'
import { PuissanceService } from '../services/puissance.service.js'
import { CurrentService } from '../services/current.service.js'
import { ThermalService } from '../services/thermal.service.js'
import { GlobalMetersService } from '../services/global-meters.service.js'
import { createEnergyHistoryController } from '../controllers/energy-history.controller.js'

const routerLogger = logger.child({ module: 'TelemetryRouter' })

/**
 * Create telemetry routes
 * Endpoints:
 * - GET /api/telemetry/devices - List available devices
 * - GET /api/telemetry/:deviceUUID/timeseries - Get device timeseries data
 * - GET /api/telemetry/:deviceUUID/kpis - Get calculated KPI values for device
 * - GET /api/telemetry/:deviceUUID/puissance - Get all Puissance view KPI values
 * - GET /api/telemetry/:deviceUUID/current - Get all Current view KPI values
 * - GET /api/telemetry/thermal - Get all thermal management sensor data
 * - GET /api/telemetry/timeseries - Legacy endpoint with explicit entity type and ID
 */
export function createTelemetryRoutes(
  telemetryService: ThingsboardTelemetryService,
  authService: ThingsboardAuthService,
  deviceService: DeviceService
): Router {
  const router = Router()
  const kpiCalculator = new KPICalculatorService()
  const puissanceService = new PuissanceService(telemetryService, deviceService)
  const currentService = new CurrentService(telemetryService, deviceService)
  const thermalService = new ThermalService(telemetryService, deviceService)
  const globalMetersService = new GlobalMetersService(telemetryService, deviceService)
  const { getEnergyHistory, getDeviceEnergyHistory, getAvailableMetrics } = createEnergyHistoryController(telemetryService)

  /**
   * GET /api/telemetry/devices
   *
   * List all available devices from the customer API
   * GET http://localhost:4000/customer/devices
   */
  router.get('/devices', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true'
      const devices = await deviceService.getDevices(forceRefresh)

      return res.json({
        success: true,
        data: devices,
        count: devices.length,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`Failed to fetch devices: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/:deviceUUID/timeseries
   *
   * Retrieve telemetry timeseries data for a specific device
   * Uses deviceUUID to lookup the device and its access token
   *
   * Path Parameters:
   * - deviceUUID: string - UUID of the device (e.g., 545ffcb0-ab9c-11f0-a05e-97f672464deb)
   *
   * Query Parameters:
   * - keys (required): string - comma-separated telemetry keys
   * - startTs (required): number - start timestamp in milliseconds (UTC)
   * - endTs (required): number - end timestamp in milliseconds (UTC)
   * - interval (optional): number - aggregation interval in milliseconds
   * - agg (optional): string - aggregation function (NONE, AVG, MIN, MAX, SUM)
   * - orderBy (optional): string - ASC or DESC
   * - limit (optional): number - max number of data points when agg=NONE
   * - useStrictDataTypes (optional): boolean - use strict data types
   *
   * Example:
   * GET /api/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/timeseries?keys=temperature,humidity&startTs=1705689600000&endTs=1705776000000
   */
  router.get('/:deviceUUID/timeseries', async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params
      const { keys, startTs, endTs, interval, agg, orderBy, limit, useStrictDataTypes } = req.query

      // Validate required parameters
      if (!keys || !startTs || !endTs) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: keys, startTs, endTs',
        })
      }

      // Fetch device and validate it exists
      const device = await deviceService.validateDevice(deviceUUID)
      routerLogger.info(`Device found: ${device.name || deviceUUID}`)

      // Parse and validate timestamps
      const startTimestamp = parseInt(String(startTs), 10)
      const endTimestamp = parseInt(String(endTs), 10)

      if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timestamp format. Expected milliseconds.',
        })
      }

      if (startTimestamp >= endTimestamp) {
        return res.status(400).json({
          success: false,
          error: 'startTs must be less than endTs',
        })
      }

      // Parse keys
      const keyArray = String(keys)
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)

      if (keyArray.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one key must be provided',
        })
      }

      // Parse optional parameters
      const intervalValue = interval ? parseInt(String(interval), 10) : undefined
      if (intervalValue && (isNaN(intervalValue) || intervalValue < 1)) {
        return res.status(400).json({
          success: false,
          error: 'Interval must be a positive number',
        })
      }

      // Validate aggregation function
      if (agg) {
        const validAgg = ['NONE', 'AVG', 'MIN', 'MAX', 'SUM']
        if (!validAgg.includes(String(agg).toUpperCase())) {
          return res.status(400).json({
            success: false,
            error: `Invalid aggregation function. Must be one of: ${validAgg.join(', ')}`,
          })
        }
      }

      // Validate order
      if (orderBy) {
        const validOrder = ['ASC', 'DESC']
        if (!validOrder.includes(String(orderBy).toUpperCase())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid orderBy. Must be ASC or DESC',
          })
        }
      }

      // Parse limit
      const limitValue = limit ? parseInt(String(limit), 10) : undefined
      if (limitValue && (isNaN(limitValue) || limitValue < 1)) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be a positive number',
        })
      }

      // Parse useStrictDataTypes
      const useStrictDataTypesValue =
        useStrictDataTypes && String(useStrictDataTypes).toLowerCase() === 'true'
          ? true
          : undefined

      routerLogger.info(
        `Timeseries request: device=${device.name || deviceUUID} keys=${keyArray.length} range=${endTimestamp - startTimestamp}ms agg=${agg || 'NONE'}`
      )

      // Call service with ThingsBoard entity (DEVICE and the device UUID)
      const data = await telemetryService.getTimeseries(
        'DEVICE',
        deviceUUID,
        keyArray,
        startTimestamp,
        endTimestamp,
        intervalValue,
        agg ? String(agg) : undefined,
        orderBy ? String(orderBy) : undefined,
        limitValue,
        useStrictDataTypesValue
      )

      return res.json({
        success: true,
        data,
        device: {
          uuid: device.deviceUUID,
          name: device.name,
          accessToken: device.accessToken,
        },
        meta: {
          entityType: 'DEVICE',
          entityId: deviceUUID,
          keys: keyArray,
          startTs: startTimestamp,
          endTs: endTimestamp,
          interval: intervalValue,
          agg: agg || 'NONE',
          orderBy: orderBy || 'default',
          limit: limitValue,
          useStrictDataTypes: useStrictDataTypesValue,
        },
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`Timeseries request failed: ${errorMsg}`)

      // Check if it's a device not found error (404)
      if (errorMsg.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: errorMsg,
        })
      }

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/:deviceUUID/kpis
   *
   * Calculate and return KPI values for a specific device
   * Fetches raw telemetry data and performs server-side calculations
   *
   * Path Parameters:
   * - deviceUUID: string - UUID of the device
   *
   * Query Parameters:
   * - startTs (required): number - start timestamp in milliseconds (UTC)
   * - endTs (required): number - end timestamp in milliseconds (UTC)
   * - debug (optional): boolean - include debug calculation details
   *
   * Example:
   * GET /api/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/kpis?startTs=1705689600000&endTs=1705776000000&debug=true
   *
   * Response:
   * {
   *   "success": true,
   *   "kpis": {
   *     "instantaneousConsumption": 5148.102,
   *     "consumedThisHour": 1234.56,
   *     "consumedToday": 45678.90,
   *     "consumedYesterday": 42156.78,
   *     "consumedDayBeforeYesterday": 41234.56,
   *     "consumedThisMonth": 207010.55,
   *     "consumedLastMonth": 0,
   *     "timestamp": 1705932090674
   *   },
   *   "debug": { ... } // if debug=true
   * }
   */
  router.get('/:deviceUUID/kpis', async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params
      const { startTs, endTs, debug } = req.query

      // Validate required parameters
      if (!startTs || !endTs) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: startTs, endTs',
        })
      }

      // Validate device exists
      const device = await deviceService.validateDevice(deviceUUID)
      routerLogger.info(`Device found for KPI calculation: ${device.name || deviceUUID}`)

      // Parse timestamps
      const startTimestamp = parseInt(String(startTs), 10)
      const endTimestamp = parseInt(String(endTs), 10)

      if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timestamp format. Expected milliseconds.',
        })
      }

      if (startTimestamp >= endTimestamp) {
        return res.status(400).json({
          success: false,
          error: 'startTs must be less than endTs',
        })
      }

      const includeDebug = debug && String(debug).toLowerCase() === 'true' ? true : undefined

      routerLogger.info(`KPI calculation request: device=${device.name || deviceUUID} debug=${includeDebug}`)

      // Fetch raw telemetry data for both ActivePowerTotal and AccumulatedActiveEnergyDelivered
      const rawData = await telemetryService.getTimeseries(
        'DEVICE',
        deviceUUID,
        ['ActivePowerTotal', 'AccumulatedActiveEnergyDelivered'],
        startTimestamp,
        endTimestamp,
        undefined, // no interval aggregation for raw data
        'NONE', // no aggregation - get all raw values
        'ASC',
        10000 // high limit to get all data points
      )

      // Transform raw data into array format for KPI calculator
      const allDataPoints: any[] = []
      
      // Add ActivePowerTotal points
      if (rawData.ActivePowerTotal) {
        rawData.ActivePowerTotal.forEach((point: any) => {
          allDataPoints.push({
            ts: point.ts,
            value: parseFloat(point.value),
            key: 'ActivePowerTotal'
          })
        })
      }

      // Add AccumulatedActiveEnergyDelivered points
      if (rawData.AccumulatedActiveEnergyDelivered) {
        rawData.AccumulatedActiveEnergyDelivered.forEach((point: any) => {
          allDataPoints.push({
            ts: point.ts,
            value: parseFloat(point.value),
            key: 'AccumulatedActiveEnergyDelivered'
          })
        })
      }

      // Calculate KPIs
      const result = kpiCalculator.calculateKPIs(allDataPoints, device.name || deviceUUID, includeDebug)

      routerLogger.info(`KPI calculation complete: device=${device.name || deviceUUID}`, result.kpis)

      return res.json({
        success: true,
        kpis: result.kpis,
        device: {
          uuid: device.deviceUUID,
          name: device.name,
        },
        meta: {
          entityType: 'DEVICE',
          entityId: deviceUUID,
          startTs: startTimestamp,
          endTs: endTimestamp,
          calculationTimestamp: result.kpis.timestamp,
          dataPointsProcessed: allDataPoints.length,
        },
        ...(includeDebug && { debug: result.debug }),
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`KPI calculation failed: ${errorMsg}`)

      if (errorMsg.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: errorMsg,
        })
      }

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/timeseries (Legacy endpoint)
   *
   * Retrieve telemetry timeseries data from ThingsBoard endpoint
   * This endpoint requires explicit entityType and entityId
   *
   * Query Parameters:
   * - entityType (required): string - e.g., DEVICE
   * - entityId (required): string - UUID of the entity
   * - keys (required): string - comma-separated telemetry keys
   * - startTs (required): number - start timestamp in milliseconds (UTC)
   * - endTs (required): number - end timestamp in milliseconds (UTC)
   * - interval (optional): number - aggregation interval in milliseconds
   * - agg (optional): string - aggregation function (NONE, AVG, MIN, MAX, SUM)
   * - orderBy (optional): string - ASC or DESC
   * - limit (optional): number - max number of data points when agg=NONE
   * - useStrictDataTypes (optional): boolean - use strict data types
   */
  router.get('/timeseries', async (req: Request, res: Response) => {
    try {
      const {
        entityType,
        entityId,
        keys,
        startTs,
        endTs,
        interval,
        agg,
        orderBy,
        limit,
        useStrictDataTypes,
      } = req.query

      // Validate required parameters
      if (!entityType || !entityId || !keys || !startTs || !endTs) {
        return res.status(400).json({
          success: false,
          error:
            'Missing required parameters: entityType, entityId, keys, startTs, endTs',
        })
      }

      // Parse and validate timestamps
      const startTimestamp = parseInt(String(startTs), 10)
      const endTimestamp = parseInt(String(endTs), 10)

      if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timestamp format. Expected milliseconds.',
        })
      }

      if (startTimestamp >= endTimestamp) {
        return res.status(400).json({
          success: false,
          error: 'startTs must be less than endTs',
        })
      }

      // Parse keys
      const keyArray = String(keys)
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)

      if (keyArray.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one key must be provided',
        })
      }

      // Parse optional parameters
      const intervalValue = interval ? parseInt(String(interval), 10) : undefined
      if (intervalValue && (isNaN(intervalValue) || intervalValue < 1)) {
        return res.status(400).json({
          success: false,
          error: 'Interval must be a positive number',
        })
      }

      // Validate aggregation function
      if (agg) {
        const validAgg = ['NONE', 'AVG', 'MIN', 'MAX', 'SUM']
        if (!validAgg.includes(String(agg).toUpperCase())) {
          return res.status(400).json({
            success: false,
            error: `Invalid aggregation function. Must be one of: ${validAgg.join(', ')}`,
          })
        }
      }

      // Validate order
      if (orderBy) {
        const validOrder = ['ASC', 'DESC']
        if (!validOrder.includes(String(orderBy).toUpperCase())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid orderBy. Must be ASC or DESC',
          })
        }
      }

      // Parse limit
      const limitValue = limit ? parseInt(String(limit), 10) : undefined
      if (limitValue && (isNaN(limitValue) || limitValue < 1)) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be a positive number',
        })
      }

      // Parse useStrictDataTypes
      const useStrictDataTypesValue =
        useStrictDataTypes && String(useStrictDataTypes).toLowerCase() === 'true'
          ? true
          : undefined

      routerLogger.info(
        `Timeseries request: ${entityType}/${entityId} keys=${keyArray.length} range=${endTimestamp - startTimestamp}ms agg=${agg || 'NONE'}`
      )

      // Call service
      const data = await telemetryService.getTimeseries(
        String(entityType),
        String(entityId),
        keyArray,
        startTimestamp,
        endTimestamp,
        intervalValue,
        agg ? String(agg) : undefined,
        orderBy ? String(orderBy) : undefined,
        limitValue,
        useStrictDataTypesValue
      )

      return res.json({
        success: true,
        data,
        meta: {
          entityType,
          entityId,
          keys: keyArray,
          startTs: startTimestamp,
          endTs: endTimestamp,
          interval: intervalValue,
          agg: agg || 'NONE',
          orderBy: orderBy || 'default',
          limit: limitValue,
          useStrictDataTypes: useStrictDataTypesValue,
        },
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`Timeseries request failed: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/:deviceUUID/puissance
   *
   * Get all Puissance view KPI values in a single optimized request
   * Makes 9 batch requests to ThingsBoard to fetch all needed telemetry data
   *
   * Path Parameters:
   * - deviceUUID: string - UUID of the device
   *
   * Query Parameters:
   * - debug (optional): boolean - include debug information about requests made
   *
   * Example:
   * GET /api/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/puissance?debug=true
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "instantaneousPower": 12310.8,           // kW (latest ActivePowerTotal)
   *     "consumedThisHour": 125.45,              // kWh (latest deltaHourEnergyConsumtion)
   *     "consumedToday": 856.32,                 // kWh (today's total consumption)
   *     "consumedYesterday": 842.15,             // kWh (yesterday's total consumption)
   *     "consumedThisMonth": 18456.78,           // kWh (this month's total consumption)
   *     "consumedLastMonth": 27341.92,           // kWh (last month's total consumption)
   *     "hourlyData": [                          // Today's hourly consumption
   *       { "ts": 1705689600000, "value": 45.23 },
   *       { "ts": 1705693200000, "value": 52.18 }
   *     ],
   *     "dailyData": [                           // This month's daily consumption
   *       { "ts": 1705689600000, "value": 842.15 },
   *       { "ts": 1705776000000, "value": 856.32 }
   *     ],
   *     "monthlyData": [                         // Last 12 months' consumption
   *       { "ts": 1702771200000, "value": 27341.92 },
   *       { "ts": 1705449600000, "value": 18456.78 }
   *     ]
   *   },
   *   "meta": {
   *     "deviceUUID": "545ffcb0-ab9c-11f0-a05e-97f672464deb",
   *     "deviceName": "PM2200 - TGBT Principal",
   *     "requestedAt": 1705932090674
   *   },
   *   "debug": { ... } // if debug=true
   * }
   */
  router.get('/:deviceUUID/puissance', async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params
      const { debug } = req.query

      const includeDebug = debug && String(debug).toLowerCase() === 'true' ? true : false

      routerLogger.info(`[Puissance] Request for device: ${deviceUUID}`, { debug: includeDebug })

      // Get Puissance KPIs
      const result = await puissanceService.getPuissanceKPIs(deviceUUID, includeDebug)

      return res.json(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[Puissance] Request failed: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/:deviceUUID/current
   *
   * Get all Current view KPI values in a single optimized request
   * Makes 9 batch requests to ThingsBoard to fetch all needed telemetry data
   * Uses Current_Avg telemetry key from ThingsBoard widgets configuration
   *
   * Path Parameters:
   * - deviceUUID: string - UUID of the device
   *
   * Query Parameters:
   * - debug (optional): boolean - include debug information about requests made
   *
   * Example:
   * GET /api/telemetry/545ffcb0-ab9c-11f0-a05e-97f672464deb/current?debug=true
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "instantaneousCurrent": 12.34,              // A (latest Current_Avg)
   *     "lastHourMin": 10.5,                        // A (last hour minimum)
   *     "lastHourAverage": 11.8,                    // A (last hour average)
   *     "lastHourMax": 14.2,                        // A (last hour maximum, MAX aggregation for widget)
   *     "todayAverage": 12.1,                       // A (today's average)
   *     "widgetData": [                             // Last hour with 15-min intervals (MAX aggregation)
   *       { "ts": 1705689600000, "value": 12.1 },
   *       { "ts": 1705690500000, "value": 13.2 }
   *     ],
   *     "hourlyData": [                             // Today's hourly average data (AVERAGE aggregation)
   *       { "ts": 1705689600000, "value": 11.8 },
   *       { "ts": 1705693200000, "value": 12.3 }
   *     ],
   *     "dailyWeekData": [                          // Last 7 days with daily average (AVERAGE aggregation)
   *       { "ts": 1705689600000, "value": 12.0 },
   *       { "ts": 1705776000000, "value": 11.9 }
   *     ],
   *     "dailyMonthData": [                         // Last 30 days with daily average (AVERAGE aggregation)
   *       { "ts": 1705689600000, "value": 12.0 },
   *       { "ts": 1705776000000, "value": 11.9 }
   *     ]
   *   },
   *   "meta": {
   *     "deviceUUID": "545ffcb0-ab9c-11f0-a05e-97f672464deb",
   *     "deviceName": "PM2200 - TGBT Principal",
   *     "requestedAt": 1705932090674
   *   },
   *   "debug": { ... } // if debug=true
   * }
   */
  router.get('/:deviceUUID/current', async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params
      const { debug } = req.query

      const includeDebug = debug && String(debug).toLowerCase() === 'true' ? true : false

      routerLogger.info(`[Current] Request for device: ${deviceUUID}`, { debug: includeDebug })

      // Get Current KPIs
      const result = await currentService.getCurrentKPIs(deviceUUID, includeDebug)

      return res.json(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[Current] Request failed: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/thermal
   *
   * Get all thermal management sensor data
   * Fetches all T_Sensor devices and their telemetry + metadata
   * 
   * Telemetry keys: Temperature, Humidity, DewPoint, RawSht3xData, Time
   * Metadata keys: active, label, powerStatus, displayName, hideAutoMode, delay
   *
   * Query Parameters:
   * - debug (optional): boolean - include debug information about requests made
   *
   * Example:
   * GET /api/telemetry/thermal?debug=true
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "sensors": [
   *       {
   *         "id": 1,
   *         "deviceUUID": "abc-123",
   *         "name": "T_Sensor_Zone_A",
   *         "label": "Temperature Sensor A",
   *         "zone": "Zone A",
   *         "active": true,
   *         "powerStatus": true,
   *         "displayName": "Zone A Sensor",
   *         "hideAutoMode": false,
   *         "delay": 5000,
   *         "temperature": 21.5,
   *         "humidity": 45.2,
   *         "dewPoint": 9.8,
   *         "rawData": { "Temperature": 21.5, "Humidity": 45.2, "DewPoint": 9.8 },
   *         "timestamp": "2026-01-28T10:30:00.000Z",
   *         "lastUpdate": 1706438400000
   *       }
   *     ],
   *     "summary": {
   *       "totalSensors": 8,
   *       "activeSensors": 6,
   *       "averageTemperature": 22.3,
   *       "minTemperature": 19.5,
   *       "maxTemperature": 25.1
   *     }
   *   },
   *   "meta": {
   *     "requestedAt": 1706438400000,
   *     "sensorCount": 8
   *   },
   *   "debug": { ... } // if debug=true
   * }
   */
  router.get('/thermal', async (req: Request, res: Response) => {
    try {
      const { debug } = req.query

      const includeDebug = debug && String(debug).toLowerCase() === 'true' ? true : false

      routerLogger.info('[Thermal] Request for thermal management data', { debug: includeDebug })

      // Get thermal management data
      const result = await thermalService.getThermalManagementData(includeDebug)

      return res.json(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[Thermal] Request failed: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/thermal/chart-data
   *
   * Get aggregated temperature data for charts
   * 24-hour window, hourly intervals, average aggregation
   * Optional query params:
   * - sensorIds (comma-separated UUIDs to filter)
   * - startTimestamp (Unix timestamp in ms, will align to HH:00:00. If not provided, uses current hour)
   *
   * GET http://localhost:4000/api/telemetry/thermal/chart-data
   * GET http://localhost:4000/api/telemetry/thermal/chart-data?sensorIds=uuid1,uuid2
   * GET http://localhost:4000/api/telemetry/thermal/chart-data?startTimestamp=1706400000000
   * GET http://localhost:4000/api/telemetry/thermal/chart-data?sensorIds=uuid1&startTimestamp=1706400000000
   */
  router.get('/thermal/chart-data', async (req: Request, res: Response) => {
    try {
      const { sensorIds, startTimestamp } = req.query

      routerLogger.info('[Thermal] Request for temperature chart data')

      // Parse sensor IDs if provided
      let sensorIdArray: string[] | undefined
      if (sensorIds && typeof sensorIds === 'string') {
        sensorIdArray = sensorIds.split(',').map(id => id.trim()).filter(id => id.length > 0)
      }

      // Parse start timestamp if provided
      let startTs: number | undefined
      if (startTimestamp && typeof startTimestamp === 'string') {
        const parsed = parseInt(startTimestamp, 10)
        if (!isNaN(parsed) && parsed > 0) {
          startTs = parsed
          routerLogger.info(`[Thermal] Using provided start timestamp: ${startTs}`)
        } else {
          routerLogger.warn(`[Thermal] Invalid start timestamp provided: ${startTimestamp}`)
        }
      }

      // Get temperature chart data
      const result = await thermalService.getTemperatureChartData(sensorIdArray, startTs)

      return res.json(result)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[Thermal] Chart data request failed: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * POST /api/telemetry/thermal/relay-control
   *
   * Control relay (start/stop) for a temperature sensor zone
   * Sends RPC command to ThingsBoard device
   *
   * Request Body:
   * {
   *   "deviceUUID": "string - UUID of the device",
   *   "action": "start" | "stop"
   * }
   *
   * Example:
   * POST /api/telemetry/thermal/relay-control
   * {
   *   "deviceUUID": "411670b0-ad1a-11f0-a05e-97f672464deb",
   *   "action": "start"
   * }
   */
  router.post('/thermal/relay-control', async (req: Request, res: Response) => {
    try {
      const { deviceUUID, action } = req.body

      if (!deviceUUID || !action) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: deviceUUID, action'
        })
      }

      if (!['start', 'stop'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid action: must be "start" or "stop"'
        })
      }

      routerLogger.info(`[Thermal] Relay control request: ${action} for device ${deviceUUID}`)

      // Call thermal service to control relay
      const result = await thermalService.controlRelay(deviceUUID, action)

      if (result.success) {
        return res.status(200).json(result)
      } else {
        return res.status(502).json(result)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[Thermal] Relay control failed: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * POST /api/telemetry/global-meters
   * Get telemetry data for multiple meters (for factory display)
   *
   * Request body:
   * {
   *   "deviceUUIDs": ["uuid1", "uuid2", "uuid3"],
   *   "debug": false
   * }
   *
   * Returns all needed data for GlobalMetersView:
   * - instantaneous power (kW)
   * - today's consumption (kWh)
   * - yesterday's consumption (kWh)
   * - hourly data for charts
   * - daily data for charts
   */
  router.post('/global-meters', async (req: Request, res: Response) => {
    try {
      const { deviceUUIDs, debug = false } = req.body

      if (!deviceUUIDs || !Array.isArray(deviceUUIDs) || deviceUUIDs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid required field: deviceUUIDs (array)',
        })
      }

      if (debug) {
        routerLogger.debug(`[GlobalMeters] Fetching data for devices: ${deviceUUIDs.join(', ')}`)
      }

      const response = await globalMetersService.getGlobalMetersData(deviceUUIDs, debug)

      return res.json(response)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[GlobalMeters] Failed to fetch meters data: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * GET /api/telemetry/global-meters/:deviceUUID
   * Get telemetry data for a single meter
   *
   * Path parameters:
   * - deviceUUID: string - UUID of the device
   *
   * Query parameters:
   * - debug: boolean - Enable debug logging
   *
   * Returns data for single meter display
   */
  router.get('/global-meters/:deviceUUID', async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params
      const { debug = false } = req.query

      if (!deviceUUID) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: deviceUUID',
        })
      }

      if (debug === 'true') {
        routerLogger.debug(`[GlobalMeters] Fetching data for device: ${deviceUUID}`)
      }

      const response = await globalMetersService.getGlobalMetersData([deviceUUID], debug === 'true')

      return res.json(response)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[GlobalMeters] Failed to fetch meter data for ${req.params.deviceUUID}: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  /**
   * POST /api/telemetry/global-meters/temperature-chart
   * Get 24-hour temperature chart data for temperature sensors
   *
   * Request body:
   * {
   *   "sensorIds": ["uuid1", "uuid2"] // optional, if omitted returns all sensors
   * }
   *
   * Returns temperature data for the last 24 hours with hourly averages
   */
  router.post('/global-meters/temperature-chart', async (req: Request, res: Response) => {
    try {
      const { sensorIds } = req.body

      routerLogger.debug(`[GlobalMeters] Fetching temperature chart data`)

      const response = await globalMetersService.getTemperatureChartData(sensorIds)

      return res.json(response)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`[GlobalMeters] Failed to fetch temperature chart data: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  // Energy History Routes
  router.get('/energy-history', getEnergyHistory)
  router.get('/:deviceUUID/energy-history', getDeviceEnergyHistory)
  router.get('/:deviceUUID/available-metrics', getAvailableMetrics)

  /**
   * GET /api/telemetry/equipmentTelemetry
   *
   * Fetch latest telemetry values for ALL customer devices
   * Optimized bulk endpoint for Equipment view display
   * Returns latest value for each device with activity status
   *
   * Query Parameters:
   * - keys (optional): string - comma-separated telemetry keys to fetch
   *   If not specified, will fetch default keys based on device type
   *
   * Example:
   * GET /api/telemetry/equipmentTelemetry?keys=ActivePowerTotal,Temperature
   * GET /api/telemetry/equipmentTelemetry
   *
   * Response:
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "deviceUUID": "device-uuid",
   *       "deviceName": "PM2200-TGBT-1",
   *       "label": "Main Meter",
   *       "active": true,
   *       "lastActivityTime": 1705932000000,
   *       "telemetry": {
   *         "ActivePowerTotal": { "ts": 1705932000000, "value": 45.2 }
   *       }
   *     }
   *   ],
   *   "count": 5
   * }
   */
  router.get('/equipmentTelemetry', async (req: Request, res: Response) => {
    try {
      const { keys } = req.query

      // Get all customer devices
      const devices = await deviceService.getDevices(false)

      if (!devices || devices.length === 0) {
        return res.json({
          success: true,
          data: [],
          count: 0,
        })
      }

      // Fetch latest telemetry for all devices in parallel
      const telemetryPromises = devices.map(async (device) => {
        try {
          // Determine keys to fetch based on device name
          let keysToFetch: string[] = []
          if (keys) {
            keysToFetch = String(keys)
              .split(',')
              .map((k) => k.trim())
              .filter((k) => k.length > 0)
          } else {
            // Use default keys based on device type (capitalized ThingsBoard keys)
            const deviceName = device.name || ''
            if (deviceName.includes('PM2200')) {
              keysToFetch = ['ActivePowerTotal', 'AccumulatedActiveEnergyDelivered']
            } else if (deviceName.includes('t_sensor')) {
              keysToFetch = ['Temperature', 'Humidity']
            } else if (deviceName.includes('Controller')) {
              keysToFetch = ['active', 'online']
            } else {
              keysToFetch = ['ActivePowerTotal', 'Temperature', 'active']
            }
          }

          // Fetch latest telemetry from ThingsBoard using getTimeseries
          // Use 24-hour window, DESC order, limit 1 to get latest values
          const now = Date.now()
          const last24h = now - 24 * 60 * 60 * 1000

          const telemetryResult = await telemetryService.getTimeseries(
            'DEVICE',
            device.deviceUUID,
            keysToFetch,
            last24h,
            now,
            undefined, // no interval
            'NONE', // no aggregation
            'DESC', // descending order (latest first)
            1 // limit to 1 (latest value)
          )

          // Transform response: extract latest value for each key
          const latestTelemetry: Record<string, any> = {}
          for (const key of keysToFetch) {
            const values = telemetryResult[key] || []
            if (values.length > 0) {
              const latest = values[0]
              latestTelemetry[key] = {
                ts: latest.ts || now,
                value: latest.value,
              }
            } else {
              latestTelemetry[key] = {
                ts: 0,
                value: null,
              }
            }
          }

          // Determine if device is active (has recent data)
          const hasRecentData = Object.values(latestTelemetry).some((data: any) => {
            const ts = data.ts || 0
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
            return ts > fiveMinutesAgo
          })

          // Get max timestamp from all telemetry values
          const maxTs = Math.max(
            ...Object.values(latestTelemetry).map((data: any) => data.ts || 0)
          )

          return {
            deviceUUID: device.deviceUUID,
            deviceName: device.name || 'Unknown Device',
            label: device.label || '',
            active: hasRecentData,
            lastActivityTime: maxTs > 0 ? maxTs : null,
            telemetry: latestTelemetry,
          }
        } catch (error) {
          routerLogger.warn(
            `Failed to fetch telemetry for device ${device.name || 'Unknown'} (${device.deviceUUID}): ${
              error instanceof Error ? error.message : String(error)
            }`
          )

          // Return device with empty telemetry on error
          return {
            deviceUUID: device.deviceUUID,
            deviceName: device.name || 'Unknown Device',
            label: device.label || '',
            active: false,
            lastActivityTime: null,
            telemetry: {},
          }
        }
      })

      const telemetryData = await Promise.all(telemetryPromises)

      return res.json({
        success: true,
        data: telemetryData,
        count: telemetryData.length,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      routerLogger.error(`Failed to fetch latest telemetry for all devices: ${errorMsg}`)

      return res.status(502).json({
        success: false,
        error: errorMsg,
      })
    }
  })

  return router
}
