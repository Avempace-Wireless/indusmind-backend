import { logger } from '../utils/logger.js'
import { ThingsboardTelemetryService } from './thingsboard/thingsboard-telemetry.service.js'
import { DeviceService } from './device.service.js'

const thermalLogger = logger.child({ module: 'ThermalService' })

/**
 * Temperature sensor telemetry data
 */
export interface SensorTelemetry {
  deviceUUID: string
  temperature: number | null // °C
  humidity: number | null // %
  dewPoint: number | null // °C
  rawData: {
    Temperature?: number
    Humidity?: number
    DewPoint?: number
  } | null
  timestamp: string | null // ISO 8601
  lastUpdate: number | null // Unix timestamp
}

/**
 * Complete sensor data with metadata
 */
export interface ThermalSensorData {
  // Device info
  id: number
  deviceUUID: string
  name: string
  label: string
  zone: string

  // Status metadata (from datasources)
  active: boolean | null
  powerStatus: boolean | null
  displayName: string | null
  hideAutoMode: boolean | null
  delay: number | null
  
  // Configuration (from ThingsBoard attributes)
  minTemp: number | null
  maxTemp: number | null
  mode: string | null
  relay: string | null
  controllerUUID: string | null

  // Current telemetry
  temperature: number | null
  humidity: number | null
  dewPoint: number | null
  rawData: {
    Temperature?: number
    Humidity?: number
    DewPoint?: number
  } | null
  timestamp: string | null
  lastUpdate: number | null
}

/**
 * Thermal management API response
 */
export interface ThermalManagementResponse {
  success: boolean
  data: {
    sensors: ThermalSensorData[]
    summary: {
      totalSensors: number
      activeSensors: number
      averageTemperature: number | null
      minTemperature: number | null
      maxTemperature: number | null
    }
  }
  meta: {
    requestedAt: number
    sensorCount: number
  }
  debug?: {
    requests: Array<{
      deviceUUID: string
      keys: string[]
      resultFound: boolean
    }>
  }
}

/**
 * Thermal Management Service
 * Handles fetching temperature sensor data for thermal management view
 * Fetches telemetry keys: Temperature, Humidity, DewPoint, RawSht3xData, Time
 * Fetches metadata: active, label, powerStatus, displayName, hideAutoMode, delay
 */
export class ThermalService {
  private logger = thermalLogger

  constructor(
    private telemetryService: ThingsboardTelemetryService,
    private deviceService: DeviceService
  ) {}

  /**
   * Get all thermal sensor data
   * Fetches all T_Sensor devices and their telemetry/metadata
   */
  async getThermalManagementData(debug: boolean = false): Promise<ThermalManagementResponse> {
    const requestedAt = Date.now()

    try {
      this.logger.info('[Thermal] Fetching thermal management data')

      // Get all devices and filter for T_Sensor type
      const allDevices = await this.deviceService.getDevices()
      const temperatureSensors = allDevices.filter(device => 
        device.name && device.name.toLowerCase().includes('t_sensor')
      )

      if (temperatureSensors.length === 0) {
        this.logger.warn('[Thermal] No temperature sensors found')
        return {
          success: true,
          data: {
            sensors: [],
            summary: {
              totalSensors: 0,
              activeSensors: 0,
              averageTemperature: null,
              minTemperature: null,
              maxTemperature: null,
            }
          },
          meta: {
            requestedAt,
            sensorCount: 0,
          }
        }
      }

      this.logger.info(`[Thermal] Found ${temperatureSensors.length} temperature sensors`)

      // Fetch telemetry and metadata for all sensors in parallel
      const debugInfo: Array<{
        deviceUUID: string
        keys: string[]
        resultFound: boolean
      }> = []

      const sensorDataPromises = temperatureSensors.map(async (device) => {
        try {
          // Fetch current telemetry values
          const telemetryData = await this.fetchSensorTelemetry(device.deviceUUID, debugInfo)
          
          // Fetch metadata attributes
          const metadataData = await this.fetchSensorMetadata(device.deviceUUID, debugInfo)

          // Combine device info, telemetry, and metadata
          const sensorData: ThermalSensorData = {
            // Device info
            id: device.id || 0,
            deviceUUID: device.deviceUUID,
            name: device.name || 'Unknown Sensor',
            label: device.label || '',
            zone: this.extractZoneFromName(device.name || ''),

            // Metadata
            active: metadataData.active,
            powerStatus: metadataData.powerStatus,
            displayName: metadataData.displayName,
            hideAutoMode: metadataData.hideAutoMode,
            delay: metadataData.delay,
            
            // Configuration from attributes
            minTemp: metadataData.minTemp,
            maxTemp: metadataData.maxTemp,
            mode: metadataData.mode,
            relay: metadataData.relay,
            controllerUUID: metadataData.controllerUUID,

            // Telemetry
            temperature: telemetryData.temperature,
            humidity: telemetryData.humidity,
            dewPoint: telemetryData.dewPoint,
            rawData: telemetryData.rawData,
            timestamp: telemetryData.timestamp,
            lastUpdate: telemetryData.lastUpdate,
          }

          return sensorData
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          this.logger.error(`[Thermal] Failed to fetch data for sensor ${device.deviceUUID}: ${errorMsg}`)
          
          // Return partial data with nulls for failed sensor
          return {
            id: device.id || 0,
            deviceUUID: device.deviceUUID,
            name: device.name || 'Unknown Sensor',
            label: device.label || '',
            zone: this.extractZoneFromName(device.name || ''),
            active: null,
            powerStatus: null,
            displayName: null,
            hideAutoMode: null,
            delay: null,
            minTemp: null,
            maxTemp: null,
            mode: null,
            relay: null,
            controllerUUID: null,
            temperature: null,
            humidity: null,
            dewPoint: null,
            rawData: null,
            timestamp: null,
            lastUpdate: null,
          } as ThermalSensorData
        }
      })

      const sensorsData = await Promise.all(sensorDataPromises)

      // Calculate summary statistics
      const summary = this.calculateSummary(sensorsData)

      const response: ThermalManagementResponse = {
        success: true,
        data: {
          sensors: sensorsData,
          summary,
        },
        meta: {
          requestedAt,
          sensorCount: sensorsData.length,
        }
      }

      if (debug) {
        response.debug = {
          requests: debugInfo,
        }
      }

      this.logger.info(`[Thermal] Successfully fetched data for ${sensorsData.length} sensors`)
      return response

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Thermal] Failed to fetch thermal management data: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Fetch telemetry data for a single sensor
   * Keys: Temperature, Humidity, DewPoint, RawSht3xData, Time
   */
  private async fetchSensorTelemetry(
    deviceUUID: string,
    debugInfo: Array<{ deviceUUID: string; keys: string[]; resultFound: boolean }>
  ): Promise<SensorTelemetry> {
    const telemetryKeys = ['Temperature', 'Humidity', 'DewPoint', 'RawSht3xData', 'Time']
    
    try {
      // Fetch latest telemetry values (last 24 hours)
      const now = Date.now()
      const last24h = now - 24 * 60 * 60 * 1000

      const telemetryResult = await this.telemetryService.getTimeseries(
        'DEVICE', // entityType
        deviceUUID,
        telemetryKeys,
        last24h,
        now,
        undefined, // no interval
        'NONE', // no aggregation
        'DESC', // descending order (latest first)
        1 // limit to 1 (latest value)
      )

      const hasData = telemetryResult && Object.keys(telemetryResult).length > 0
      debugInfo.push({
        deviceUUID,
        keys: telemetryKeys,
        resultFound: hasData,
      })

      // Extract values from response
      const temperature = this.extractLatestNumericValue(telemetryResult, 'Temperature')
      const humidity = this.extractLatestNumericValue(telemetryResult, 'Humidity')
      const dewPoint = this.extractLatestNumericValue(telemetryResult, 'DewPoint')
      const rawDataStr = this.extractLatestStringValue(telemetryResult, 'RawSht3xData')
      const timeStr = this.extractLatestStringValue(telemetryResult, 'Time')

      // Parse raw data JSON if available
      let rawData: { Temperature?: number; Humidity?: number; DewPoint?: number } | null = null
      if (rawDataStr) {
        try {
          rawData = JSON.parse(rawDataStr)
        } catch (e) {
          this.logger.warn(`[Thermal] Failed to parse RawSht3xData for ${deviceUUID}`)
        }
      }

      // Get timestamp (use Time key or fallback to Temperature timestamp)
      let timestamp: string | null = timeStr
      let lastUpdate: number | null = null

      if (!timestamp && telemetryResult['Temperature']?.[0]) {
        lastUpdate = telemetryResult['Temperature'][0].ts
        if (lastUpdate) {
          timestamp = new Date(lastUpdate).toISOString()
        }
      } else if (timestamp) {
        lastUpdate = new Date(timestamp).getTime()
      }

      return {
        deviceUUID,
        temperature,
        humidity,
        dewPoint,
        rawData,
        timestamp,
        lastUpdate,
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Thermal] Failed to fetch telemetry for ${deviceUUID}: ${errorMsg}`)
      
      debugInfo.push({
        deviceUUID,
        keys: telemetryKeys,
        resultFound: false,
      })

      return {
        deviceUUID,
        temperature: null,
        humidity: null,
        dewPoint: null,
        rawData: null,
        timestamp: null,
        lastUpdate: null,
      }
    }
  }

  /**
   * Fetch metadata attributes for a single sensor
   * Keys: active, powerStatus, displayName, hideAutoMode, delay, minTemp, maxTemp, mode, relay, controllerUUID
   */
  private async fetchSensorMetadata(
    deviceUUID: string,
    debugInfo: Array<{ deviceUUID: string; keys: string[]; resultFound: boolean }>
  ): Promise<{
    active: boolean | null
    powerStatus: boolean | null
    displayName: string | null
    hideAutoMode: boolean | null
    delay: number | null
    minTemp: number | null
    maxTemp: number | null
    mode: string | null
    relay: string | null
    controllerUUID: string | null
  }> {
    const metadataKeys = ['active', 'powerStatus', 'displayName', 'hideAutoMode', 'delay', 'minTemp', 'maxTemp', 'mode', 'relay', 'controllerUUID']
    
    try {
      // Fetch attributes from ThingsBoard
      const attributes = await this.telemetryService.getLatestAttributes('DEVICE', deviceUUID, metadataKeys)

      const hasData = !!(attributes && Object.keys(attributes).length > 0)
      debugInfo.push({
        deviceUUID,
        keys: metadataKeys,
        resultFound: hasData,
      })

      return {
        active: this.parseBoolean(attributes?.['active']),
        powerStatus: this.parseBoolean(attributes?.['powerStatus']),
        displayName: attributes?.['displayName']?.toString() || null,
        hideAutoMode: this.parseBoolean(attributes?.['hideAutoMode']),
        delay: this.parseNumber(attributes?.['delay']),
        minTemp: this.parseNumber(attributes?.['minTemp']),
        maxTemp: this.parseNumber(attributes?.['maxTemp']),
        mode: attributes?.['mode']?.toString() || null,
        relay: attributes?.['relay']?.toString() || null,
        controllerUUID: attributes?.['controllerUUID']?.toString() || null,
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.warn(`[Thermal] Failed to fetch metadata for ${deviceUUID}: ${errorMsg}`)
      
      debugInfo.push({
        deviceUUID,
        keys: metadataKeys,
        resultFound: false,
      })

      return {
        active: null,
        powerStatus: null,
        displayName: null,
        hideAutoMode: null,
        delay: null,
        minTemp: null,
        maxTemp: null,
        mode: null,
        relay: null,
        controllerUUID: null,
      }
    }
  }

  /**
   * Extract latest numeric value from timeseries result
   */
  private extractLatestNumericValue(
    result: Record<string, Array<{ ts: number; value: any }>> | null,
    key: string
  ): number | null {
    if (!result || !result[key] || result[key].length === 0) {
      return null
    }

    const value = result[key][0].value
    const num = parseFloat(value)
    return isNaN(num) ? null : num
  }

  /**
   * Extract latest string value from timeseries result
   */
  private extractLatestStringValue(
    result: Record<string, Array<{ ts: number; value: any }>> | null,
    key: string
  ): string | null {
    if (!result || !result[key] || result[key].length === 0) {
      return null
    }

    const value = result[key][0].value
    return value?.toString() || null
  }

  /**
   * Parse boolean from attribute value
   */
  private parseBoolean(value: any): boolean | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (lower === 'true') return true
      if (lower === 'false') return false
    }
    if (typeof value === 'number') return value !== 0
    return null
  }

  /**
   * Parse number from attribute value
   */
  private parseNumber(value: any): number | null {
    if (value === null || value === undefined) return null
    const num = parseFloat(value)
    return isNaN(num) ? null : num
  }

  /**
   * Extract zone name from device name
   * Example: "T_Sensor_Zone_A" -> "Zone A"
   */
  private extractZoneFromName(name: string): string {
    // Try to extract zone from device name patterns
    // Pattern 1: "Zone_1", "Zone 1", "Zone1", etc.
    const zoneMatch = name.match(/Zone[_\s]?([A-Za-z0-9]+)/i)
    if (zoneMatch) {
      return `Zone ${zoneMatch[1]}`
    }

    // Pattern 2: "t_sensor_zone_1", "t_sensor_1", etc.
    const sensorMatch = name.match(/(?:t_sensor|sensor)[_\s]?([A-Za-z0-9]+)/i)
    if (sensorMatch) {
      const value = sensorMatch[1].toUpperCase()
      return value.length === 1 ? `Zone ${value}` : `Zone ${value}`
    }

    // Pattern 3: Just use the part after "t_sensor_"
    if (name.toLowerCase().includes('t_sensor')) {
      const parts = name.split(/[_-]/)
      if (parts.length > 1) {
        return `Zone ${parts[parts.length - 1].toUpperCase()}`
      }
    }

    // Default fallback
    return 'Unnamed Zone'
  }

  /**
   * Calculate summary statistics from sensor data
   */
  private calculateSummary(sensors: ThermalSensorData[]): {
    totalSensors: number
    activeSensors: number
    averageTemperature: number | null
    minTemperature: number | null
    maxTemperature: number | null
  } {
    const totalSensors = sensors.length
    const activeSensors = sensors.filter(s => s.active === true).length

    const temperatures = sensors
      .map(s => s.temperature)
      .filter((t): t is number => t !== null && !isNaN(t))

    if (temperatures.length === 0) {
      return {
        totalSensors,
        activeSensors,
        averageTemperature: null,
        minTemperature: null,
        maxTemperature: null,
      }
    }

    const sum = temperatures.reduce((acc, t) => acc + t, 0)
    const avg = sum / temperatures.length
    const min = Math.min(...temperatures)
    const max = Math.max(...temperatures)

    return {
      totalSensors,
      activeSensors,
      averageTemperature: Math.round(avg * 10) / 10,
      minTemperature: Math.round(min * 10) / 10,
      maxTemperature: Math.round(max * 10) / 10,
    }
  }

  /**
   * Fetch aggregated temperature data for charts
   * Returns 24-hour historical data with hourly intervals, averaged
   * @param sensorIds Optional array of sensor device UUIDs to filter
   * @param startTimestamp Optional start timestamp in milliseconds - will be aligned to HH:00:00
   * @returns Chart data with timestamps and aggregated temperatures
   */
  async getTemperatureChartData(
    sensorIds?: string[],
    startTimestamp?: number
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
        }>
      }>
    }
  }> {
    try {
      let alignedStartTs: number

      if (startTimestamp) {
        // If timestamp provided, align to the start of that hour
        const startDate = new Date(startTimestamp)
        startDate.setMinutes(0, 0, 0) // Set to HH:00:00
        alignedStartTs = startDate.getTime()
        this.logger.info(`[Thermal] Using provided start timestamp: ${alignedStartTs} (${startDate.toISOString()})`)
      } else {
        // Default: use current time aligned to start of current hour
        const now = new Date()
        now.setMinutes(30, 0, 0) // Set to HH:00:00
        alignedStartTs = now.getTime() 
        this.logger.info(`[Thermal] Using current hour start: ${alignedStartTs} (${new Date(alignedStartTs).toISOString()})`)
      }
      
      // Calculate 24-hour window from aligned hour
      const startTs = alignedStartTs - 24 * 60 * 60 * 1000 // 24 hours back from current hour start
      const endTs = alignedStartTs // End at current hour boundary

      // 1 hour in milliseconds for grouping interval
      const interval = 60 * 60 * 1000

      this.logger.info(`[Thermal] Fetching chart data: 24-hour window from ${startTs} to ${endTs}`)
      this.logger.info(`[Thermal] Start time: ${new Date(startTs).toISOString()} (${new Date(startTs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })})`)
      this.logger.info(`[Thermal] End time: ${new Date(endTs).toISOString()} (${new Date(endTs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })})`)
      this.logger.info(`[Thermal] Interval: ${interval}ms (1 hour)`)

      // Get all devices
      const allDevices = await this.deviceService.getDevices()
      const temperatureSensors = allDevices.filter((d: any) => d.name?.startsWith('t_sensor') || d.name?.startsWith('Indusmind_T_Sensor'))

      this.logger.info(`[Thermal] Found ${temperatureSensors.length} temperature sensors`)

      // Filter by sensorIds if provided
      const sensorsToFetch = sensorIds
        ? temperatureSensors.filter((d: any) => sensorIds.includes(d.deviceUUID))
        : temperatureSensors

      if (sensorsToFetch.length === 0) {
        this.logger.warn('[Thermal] No temperature sensors found for chart data')
        return {
          success: true,
          data: { sensors: [] },
        }
      }

      this.logger.info(`[Thermal] Fetching chart data for ${sensorsToFetch.length} sensors`)

      // Fetch aggregated temperature data for each sensor
      const chartDataPromises = sensorsToFetch.map(async (device: any) => {
        try {
          this.logger.debug(`[Thermal] Fetching chart data for sensor ${device.deviceUUID} (${device.name})`)
          this.logger.info('[Thermal] Sensor data startTs',startTs)
          this.logger.info('[Thermal] Sensor data endTs',endTs)
          const telemetryData = await this.telemetryService.getTimeseries(
            'DEVICE',
            device.deviceUUID,
            ['Temperature'],
            startTs,
            endTs,
            interval,
            'AVG', // Use average aggregation
            'ASC'  // Oldest first for chronological order
          )

          // Extract and map temperature values
          const temperatureValues = telemetryData['Temperature'] || []
          
          this.logger.debug(`[Thermal] Received ${temperatureValues.length} hourly data points for sensor ${device.deviceUUID}`)

          const data = temperatureValues.map((point: any) => {
            const value = typeof point.value === 'string' ? parseFloat(point.value) : point.value
            const date = new Date(point.ts)
            const isoDate = date.toISOString()
            const readableDate = date.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            })
            
            return {
              timestamp: point.ts,
              date: isoDate,
              readableDate: readableDate,
              value: Number(value?.toFixed(1) ?? 0),
            }
          })

          return {
            deviceUUID: device.deviceUUID,
            sensorLabel: device.label || device.name || 'Unknown',
            sensorName: device.name || 'Unknown',
            data: data,
          }
        } catch (error) {
          this.logger.warn(
            `[Thermal] Failed to fetch chart data for sensor ${device.deviceUUID}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
          return {
            deviceUUID: device.deviceUUID,
            sensorLabel: device.label || device.name || 'Unknown',
            sensorName: device.name || 'Unknown',
            data: [],
          }
        }
      })

      const sensorsChartData = await Promise.all(chartDataPromises)

      const successfulSensors = sensorsChartData.filter(s => s.data.length > 0)
      this.logger.info(`[Thermal] Successfully fetched data for ${successfulSensors.length}/${sensorsChartData.length} sensors`)

      return {
        success: true,
        data: {
          sensors: sensorsChartData,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Thermal] Failed to fetch temperature chart data: ${errorMsg}`)
      return {
        success: false,
        data: { sensors: [] },
      }
    }
  }

  /**
   * Control relay (start/stop) for a sensor zone
   * Sends RPC command to ThingsBoard device
   * @param deviceUUID UUID of the temperature sensor device
   * @param action 'start' or 'stop' - relay state command
   * @returns Success/failure response with status
   */
  async controlRelay(
    deviceUUID: string,
    action: 'start' | 'stop'
  ): Promise<{
    success: boolean
    message: string
    data?: any
  }> {
    try {
      // Find device with matching UUID
      const allDevices = await this.deviceService.getDevices()
      const device = allDevices.find((d: any) => d.deviceUUID === deviceUUID)

      if (!device) {
        return {
          success: false,
          message: `Device not found: ${deviceUUID}`,
        }
      }

      this.logger.info(`[Thermal] Controlling relay for ${device.name}: ${action}`)

      // Get thermal metadata (includes controllerUUID and relay)
      const metadata = await this.fetchSensorMetadata(deviceUUID, [])
      
      if (!metadata.controllerUUID) {
        return {
          success: false,
          message: `No controller UUID found for device ${device.name}`,
        }
      }

      if (!metadata.relay) {
        return {
          success: false,
          message: `No relay assigned to device ${device.name}`,
        }
      }

      // Find the controller device by name (controllerUUID is actually the controller's name)
      const controllerDevice = allDevices.find((d: any) => d.name === metadata.controllerUUID)
      
      if (!controllerDevice) {
        return {
          success: false,
          message: `Controller device not found: ${metadata.controllerUUID}`,
        }
      }

      this.logger.info(`[Thermal] Using controller ${controllerDevice.name} (${controllerDevice.deviceUUID}) to control relay ${metadata.relay}`)

      // Update the 'active' attribute on the controller device to control the relay
      // active: true = relay ON, active: false = relay OFF
      const activeValue = action === 'start'
      const response = await this.telemetryService.updateAttributes(
        'device',
        controllerDevice.deviceUUID,
        {
          active: activeValue  // true for start/on, false for stop/off
        }
      )

      if (response) {
        this.logger.info(`[Thermal] Successfully sent ${action} command to controller for ${metadata.relay}`)
        return {
          success: true,
          message: `Relay ${action} command sent successfully`,
          data: response
        }
      } else {
        return {
          success: false,
          message: `Failed to send ${action} command to controller`
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`[Thermal] Failed to control relay: ${errorMsg}`)
      return {
        success: false,
        message: errorMsg
      }
    }
  }
}
