/**
 * Energy History Controller - REST API endpoints for historical energy analysis
 */

import { Request, Response } from 'express'
import { EnergyHistoryService } from '@/services/energy-history.service.js'
import type { ThingsboardTelemetryService } from '@/services/thingsboard/thingsboard-telemetry.service.js'

/**
 * Create energy history controller handlers
 * Requires ThingsboardTelemetryService as dependency
 */
export function createEnergyHistoryController(telemetryService: ThingsboardTelemetryService) {
  const energyHistoryService = new EnergyHistoryService(telemetryService)

  /**
   * GET /telemetry/energy-history
   *
   * Get energy history data for one or multiple devices.
   *
   * Query Parameters:
   * - devices: Comma-separated device UUIDs
   * - startDate: Unix timestamp in milliseconds
   * - endDate: Unix timestamp in milliseconds
   * - metrics: Comma-separated metric types (energy,co2,cost,consumption)
   * - resolution: 'hourly' or 'daily'
   * - hourFrom: Optional hour filter (0-23)
   * - hourTo: Optional hour filter (0-23)
   * - debug: Set to 'true' to include debug info
   */
  const getEnergyHistory = async (req: Request, res: Response) => {
    try {
      const { devices, startDate: startDateQuery, endDate: endDateQuery, metrics: metricsQuery, resolution: resolutionQuery, hourFrom: hourFromQuery, hourTo: hourToQuery, debug: debugQuery } = req.query

      // Parse and validate query parameters
      if (!devices || !startDateQuery || !endDateQuery) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Missing required parameters: devices, startDate, endDate',
          error: 'Bad Request'
        })
      }

      const deviceUUIDs = (devices as string).split(',').map(d => d.trim()).filter(d => d)
      const startDate = parseInt(startDateQuery as string, 10)
      const endDate = parseInt(endDateQuery as string, 10)
      const metrics = (metricsQuery as string)?.split(',').map(m => m.trim()).filter(m => m) || ['consumption']
      const resolution = (resolutionQuery as 'hourly' | 'daily') || 'daily'
      const hourFrom = hourFromQuery ? parseInt(hourFromQuery as string, 10) : undefined
      const hourTo = hourToQuery ? parseInt(hourToQuery as string, 10) : undefined

      if (isNaN(startDate) || isNaN(endDate)) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Invalid startDate or endDate: must be Unix timestamp in milliseconds',
          error: 'Bad Request'
        })
      }

      if (deviceUUIDs.length === 0) {
        return res.status(400).json({
          statusCode: 400,
          message: 'At least one device UUID required',
          error: 'Bad Request'
        })
      }

      if (startDate >= endDate) {
        return res.status(400).json({
          statusCode: 400,
          message: 'startDate must be before endDate',
          error: 'Bad Request'
        })
      }

      console.log(`[EnergyHistoryController] Fetching energy history for ${deviceUUIDs.length} device(s)`)

      // Call service
      const result = await energyHistoryService.getEnergyHistory({
        deviceUUIDList: deviceUUIDs,
        startDate,
        endDate,
        metricTypes: metrics as any,
        resolution,
        hourFrom,
        hourTo
      })

      // Remove debug info if not requested
      if (debugQuery !== 'true') {
        delete result.debug
      }

      return res.json(result)
    } catch (error) {
      console.error('[EnergyHistoryController] Error in getEnergyHistory:', error)
      return res.status(500).json({
        statusCode: 500,
        message: error instanceof Error ? error.message : 'Internal server error',
        error: 'Internal Server Error'
      })
    }
  }

  /**
   * GET /telemetry/:deviceUUID/energy-history
   *
   * Get energy history for a specific device.
   *
   * Convenience endpoint - same as above but with device UUID in path.
   */
  const getDeviceEnergyHistory = async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params
      const { startDate: startDateQuery, endDate: endDateQuery, metrics: metricsQuery, resolution: resolutionQuery, hourFrom: hourFromQuery, hourTo: hourToQuery, debug: debugQuery } = req.query

      // Delegate to main handler with device UUID
      if (!startDateQuery || !endDateQuery) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Missing required parameters: startDate, endDate',
          error: 'Bad Request'
        })
      }

      const startDate = parseInt(startDateQuery as string, 10)
      const endDate = parseInt(endDateQuery as string, 10)
      const metrics = (metricsQuery as string)?.split(',').map(m => m.trim()).filter(m => m) || ['consumption']
      const resolution = (resolutionQuery as 'hourly' | 'daily') || 'daily'
      const hourFrom = hourFromQuery ? parseInt(hourFromQuery as string, 10) : undefined
      const hourTo = hourToQuery ? parseInt(hourToQuery as string, 10) : undefined

      if (isNaN(startDate) || isNaN(endDate)) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Invalid startDate or endDate: must be Unix timestamp in milliseconds',
          error: 'Bad Request'
        })
      }

      console.log(`[EnergyHistoryController] Fetching energy history for device: ${deviceUUID}`)

      const result = await energyHistoryService.getEnergyHistory({
        deviceUUIDList: [deviceUUID],
        startDate,
        endDate,
        metricTypes: metrics as any,
        resolution,
        hourFrom,
        hourTo
      })

      if (debugQuery !== 'true') {
        delete result.debug
      }

      return res.json(result)
    } catch (error) {
      console.error('[EnergyHistoryController] Error in getDeviceEnergyHistory:', error)
      return res.status(500).json({
        statusCode: 500,
        message: error instanceof Error ? error.message : 'Internal server error',
        error: 'Internal Server Error'
      })
    }
  }

  /**
   * GET /telemetry/:deviceUUID/available-metrics
   *
   * Get available metrics for a device.
   */
  const getAvailableMetrics = async (req: Request, res: Response) => {
    try {
      const { deviceUUID } = req.params

      const metrics = await energyHistoryService.getAvailableMetrics(deviceUUID)

      return res.json({
        success: true,
        data: metrics,
        meta: {
          deviceUUID,
          requestedAt: Date.now()
        }
      })
    } catch (error) {
      console.error('[EnergyHistoryController] Error fetching available metrics:', error)
      return res.status(500).json({
        statusCode: 500,
        message: error instanceof Error ? error.message : 'Internal server error',
        error: 'Internal Server Error'
      })
    }
  }

  return {
    getEnergyHistory,
    getDeviceEnergyHistory,
    getAvailableMetrics
  }
}
