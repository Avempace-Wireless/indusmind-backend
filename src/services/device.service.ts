import axios from 'axios'
import { logger } from '../utils/logger.js'

const deviceLogger = logger.child({ module: 'DeviceService' })

export interface Device {
  deviceUUID: string
  accessToken: string
  name?: string
  [key: string]: any
}

/**
 * Device Service
 * Fetches device information from the customer API
 */
export class DeviceService {
  private readonly baseUrl: string
  private readonly apiTimeout: number = 10000
  private devicesCache: Device[] | null = null
  private cacheTimestamp: number = 0
  private readonly cacheDuration: number = 5 * 60 * 1000 // 5 minutes

  constructor(baseUrl: string = 'http://localhost:4000') {
    this.baseUrl = baseUrl
  }

  /**
   * Get all devices from the customer API
   * GET {baseUrl}/customer/devices
   */
  async getDevices(forceRefresh: boolean = false): Promise<Device[]> {
    try {
      // Return cached devices if still fresh
      if (!forceRefresh && this.devicesCache && this.isCacheFresh()) {
        deviceLogger.debug('Returning cached devices')
        return this.devicesCache
      }

      deviceLogger.info('Fetching devices from API')

      const response = await axios.get(
        `${this.baseUrl}/customer/devices`,
        {
          timeout: this.apiTimeout,
        }
      )

      // Some endpoints wrap payload in { success, data }
      const payload = response.data as unknown
      const devices =
        payload && typeof payload === 'object' && 'data' in (payload as any)
          ? (payload as any).data
          : payload

      if (!Array.isArray(devices)) {
        throw new Error('Invalid devices response: expected array')
      }

      // Cache the devices
      this.devicesCache = devices
      this.cacheTimestamp = Date.now()

      deviceLogger.info(`Successfully fetched ${devices.length} devices`)
      return devices
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      deviceLogger.error(`Failed to fetch devices: ${errorMsg}`)

      // Return cached devices if available (stale cache fallback)
      if (this.devicesCache) {
        deviceLogger.warn('Using stale cached devices due to fetch error')
        return this.devicesCache
      }

      throw new Error(`Failed to fetch devices from ${this.baseUrl}/customer/devices: ${errorMsg}`)
    }
  }

  /**
   * Get a specific device by UUID
   */
  async getDeviceByUUID(deviceUUID: string, forceRefresh: boolean = false): Promise<Device> {
    const devices = await this.getDevices(forceRefresh)
    const device = devices.find((d) => d.deviceUUID === deviceUUID)

    if (!device) {
      throw new Error(`Device with UUID ${deviceUUID} not found`)
    }

    return device
  }

  /**
   * Validate that a device exists and get its details
   */
  async validateDevice(deviceUUID: string): Promise<Device> {
    try {
      return await this.getDeviceByUUID(deviceUUID, false)
    } catch (error) {
      // Try refreshing the cache
      return await this.getDeviceByUUID(deviceUUID, true)
    }
  }

  /**
   * Clear the device cache
   */
  clearCache(): void {
    this.devicesCache = null
    this.cacheTimestamp = 0
    deviceLogger.info('Device cache cleared')
  }

  /**
   * Check if cache is still fresh
   */
  private isCacheFresh(): boolean {
    return Date.now() - this.cacheTimestamp < this.cacheDuration
  }
}
