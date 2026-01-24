import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from '../services/thingsboard/thingsboard-telemetry.service.js'
import { ThingsboardAuthService } from '../services/thingsboard/thingsboard-auth.service.js'
import { DeviceService } from '../services/device.service.js'
import { KPICalculatorService } from '../services/kpi-calculator.service.js'
import { PuissanceService } from '../services/puissance.service.js'
import { createEnergyHistoryController } from '../controllers/energy-history.controller.js'

const routerLogger = logger.child({ module: 'TelemetryRouter' })

/**
 * Create telemetry routes
 * Endpoints:
 * - GET /api/telemetry/devices - List available devices
 * - GET /api/telemetry/:deviceUUID/timeseries - Get device timeseries data
 * - GET /api/telemetry/:deviceUUID/kpis - Get calculated KPI values for device
 * - GET /api/telemetry/:deviceUUID/puissance - Get all Puissance view KPI values
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

  // Energy History Routes
  router.get('/energy-history', getEnergyHistory)
  router.get('/:deviceUUID/energy-history', getDeviceEnergyHistory)
  router.get('/:deviceUUID/available-metrics', getAvailableMetrics)

  return router
}
