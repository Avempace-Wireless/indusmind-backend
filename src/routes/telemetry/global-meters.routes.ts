import { Router, Request, Response } from 'express'
import { logger } from '../../utils/logger.js'
import { GlobalMetersService } from '../../services/global-meters.service.js'
import { ThingsboardTelemetryService } from '../../services/thingsboard/thingsboard-telemetry.service.js'
import { ThingsboardAuthService } from '../../services/thingsboard/thingsboard-auth.service.js'
import { DeviceService } from '../../services/device.service.js'

const globalMetersRouter = Router()
const globalMetersLogger = logger.child({ module: 'GlobalMetersRouter' })

/**
 * Initialize Global Meters Service
 */
let globalMetersService: GlobalMetersService
function initializeService() {
  if (!globalMetersService) {
    const authService = new ThingsboardAuthService()
    const telemetryService = new ThingsboardTelemetryService(authService)
    const deviceService = new DeviceService()
    globalMetersService = new GlobalMetersService(telemetryService, deviceService)
  }
  return globalMetersService
}

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
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "deviceUUID": "uuid1",
 *       "name": "PM2200 - TGBT",
 *       "status": "online",
 *       "instantaneous": 45.2,  // kW
 *       "today": 320.5,  // kWh
 *       "yesterday": 298.3,  // kWh
 *       "hourlyData": [...],  // Today's hourly consumption
 *       "monthlyData": [...]   // This month's daily consumption
 *     }
 *   ],
 *   "meta": {
 *     "count": 1,
 *     "requestedAt": 1705248000000
 *   }
 * }
 */
globalMetersRouter.post('/global-meters', async (req: Request, res: Response) => {
  try {
    const { deviceUUIDs = [], debug = false } = req.body

    if (!deviceUUIDs || deviceUUIDs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceUUIDs array is required and must not be empty',
      })
    }

    globalMetersLogger.info(`[GlobalMetersRouter] Requested global meters data for ${deviceUUIDs.length} devices`, {
      deviceUUIDs,
    })

    const service = initializeService()
    const response = await service.getGlobalMetersData(deviceUUIDs, debug)

    res.json(response)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    globalMetersLogger.error(`[GlobalMetersRouter] Error fetching global meters data: ${errorMsg}`, { error })

    res.status(500).json({
      success: false,
      error: 'Failed to fetch global meters data',
      message: errorMsg,
    })
  }
})

/**
 * GET /api/telemetry/global-meters/:deviceUUID
 * Get telemetry data for a single meter
 *
 * Query parameters:
 * - debug: boolean (optional, for debugging)
 *
 * Example:
 * GET /api/telemetry/global-meters/545ffcb0-ab9c-11f0-a05e-97f672464deb?debug=true
 */
globalMetersRouter.get('/global-meters/:deviceUUID', async (req: Request, res: Response) => {
  try {
    const { deviceUUID } = req.params
    const { debug = false } = req.query

    if (!deviceUUID) {
      return res.status(400).json({
        success: false,
        error: 'deviceUUID is required',
      })
    }

    globalMetersLogger.info(`[GlobalMetersRouter] Requested global meter data for device ${deviceUUID}`)

    const service = initializeService()
    const response = await service.getGlobalMetersData([deviceUUID], debug === 'true')

    res.json(response)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    globalMetersLogger.error(`[GlobalMetersRouter] Error fetching single meter data: ${errorMsg}`, { error })

    res.status(500).json({
      success: false,
      error: 'Failed to fetch meter data',
      message: errorMsg,
    })
  }
})

export default globalMetersRouter
