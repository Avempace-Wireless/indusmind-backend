import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from '../services/thingsboard/thingsboard-telemetry.service.js'
import { ThingsboardAuthService } from '../services/thingsboard/thingsboard-auth.service.js'
import { DeviceService } from '../services/device.service.js'

const routerLogger = logger.child({ module: 'TelemetryRouter' })

/**
 * Create telemetry routes
 * Endpoints:
 * - GET /api/telemetry/devices - List available devices
 * - GET /api/telemetry/:deviceUUID/timeseries - Get device timeseries data
 * - GET /api/telemetry/timeseries - Legacy endpoint with explicit entity type and ID
 */
export function createTelemetryRoutes(
  telemetryService: ThingsboardTelemetryService,
  authService: ThingsboardAuthService,
  deviceService: DeviceService
): Router {
  const router = Router()

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

  return router
}
