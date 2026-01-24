import { AxiosError } from 'axios'
import { logger } from '../../utils/logger.js'
import { ThingsboardAuthService } from './thingsboard-auth.service.js'

const telemetryLogger = logger.child({ module: 'ThingsboardTelemetryService' })

/**
 * ThingsBoard Telemetry Service
 * Retrieves timeseries data from ThingsBoard using the endpoint:
 * GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries
 */
export class ThingsboardTelemetryService {
  private logger = telemetryLogger
  private readonly authService: ThingsboardAuthService
  private readonly maxRetries = 3
  private readonly retryDelayMs = 1000

  constructor(authService: ThingsboardAuthService) {
    this.authService = authService
  }

  /**
   * Retrieve telemetry timeseries data from ThingsBoard
   * GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries
   *
   * @param entityType - Type of entity (e.g., DEVICE)
   * @param entityId - UUID of the entity
   * @param keys - Comma-separated list of telemetry keys to retrieve
   * @param startTs - Start timestamp in milliseconds (UTC)
   * @param endTs - End timestamp in milliseconds (UTC)
   * @param interval - Optional aggregation interval in milliseconds
   * @param agg - Optional aggregation function (NONE, AVG, MIN, MAX, SUM)
   * @param orderBy - Optional sort order (ASC or DESC)
   * @param limit - Optional max number of data points when agg=NONE
   * @param useStrictDataTypes - Optional boolean to use strict data types
   */
  async getTimeseries(
    entityType: string,
    entityId: string,
    keys: string[],
    startTs: number,
    endTs: number,
    interval?: number,
    agg?: string,
    orderBy?: string,
    limit?: number,
    useStrictDataTypes?: boolean
  ): Promise<Record<string, any[]>> {
    return this.getTimeseriesWithRetry(
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
      0
    )
  }

  /**
   * Retrieve telemetry with automatic retry on 401 (token expired)
   */
  private async getTimeseriesWithRetry(
    entityType: string,
    entityId: string,
    keys: string[],
    startTs: number,
    endTs: number,
    interval?: number,
    agg?: string,
    orderBy?: string,
    limit?: number,
    useStrictDataTypes?: boolean,
    retryCount: number = 0
  ): Promise<Record<string, any[]>> {
    try {
      const client = await this.authService.getAuthenticatedClient()

      // Build query parameters
      const params: Record<string, string | number | boolean> = {
        keys: keys.join(','),
        startTs: startTs.toString(),
        endTs: endTs.toString(),
      }

      if (interval !== undefined) {
        params.interval = interval
      }
      if (agg !== undefined) {
        params.agg = agg
      }
      if (orderBy !== undefined) {
        params.orderBy = orderBy
      }
      if (limit !== undefined) {
        params.limit = limit
      }
      if (useStrictDataTypes !== undefined) {
        params.useStrictDataTypes = useStrictDataTypes
      }

      const endpoint = `/api/plugins/telemetry/${entityType}/${entityId}/values/timeseries`

      const baseURL = (client.defaults && client.defaults.baseURL) ? String(client.defaults.baseURL) : ''
      
      // Build full URL for testing
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')
      const fullUrl = `${baseURL}${endpoint}?${queryString}`
      
      this.logger.info(
        `Fetching telemetry: ${entityType}/${entityId} keys=${keys.join(',')} range=${startTs}-${endTs}`
      )
      this.logger.info(
        `Timestamp details - Start: ${startTs}ms (${new Date(startTs).toISOString()}), End: ${endTs}ms (${new Date(endTs).toISOString()})`
      )
      this.logger.info(
        `Keys passed to API: ${JSON.stringify(keys)}`
      )
      this.logger.info(
        `Full API URL (for Postman testing): ${fullUrl}`
      )
      this.logger.info(
        `Request URL: ${baseURL}${endpoint}`
      )
      this.logger.info(
        `Request params: ${JSON.stringify(params)}`
      )
      this.logger.info(
        `Parameters being sent - interval: ${params.interval}, agg: ${params.agg}, orderBy: ${params.orderBy}, limit: ${params.limit}`
      )
      
      // Log authorization token for Postman testing
      const authHeader = client.defaults?.headers?.common?.['Authorization'] || client.defaults?.headers?.['Authorization']
      if (authHeader) {
        this.logger.info(
          `Authorization Header (use in Postman): ${authHeader}`
        )
      }
      
      this.logger.info(
        `⚠️  COMPARISON: Working URL only passes: keys, startTs, endTs, useStrictDataTypes. Our request also passes: interval, agg, orderBy, limit`
      )

      const response = await client.get(endpoint, {
        params,
        validateStatus: () => true, // Handle all status codes
      })

      this.logger.info(
        `API Response Status: ${response.status}`
      )
      this.logger.info(
        `API Response Data: ${JSON.stringify(response.data)}`
      )

      if (response.status === 200) {
        const dataKeys = Object.keys(response.data || {})
        this.logger.info(
          `Successfully retrieved telemetry for ${entityId} - returned keys: ${dataKeys.length > 0 ? dataKeys.join(',') : 'NONE'}`
        )
        return response.data
      }

      if (response.status === 401 && retryCount < this.maxRetries) {
        // Token expired, refresh and retry
        this.logger.warn(
          `Received 401, refreshing token and retrying (attempt ${retryCount + 1}/${this.maxRetries})`
        )

        // Wait a bit before retrying
        await this.delay(this.retryDelayMs)

        // Refresh token
        await this.authService.refreshToken()

        // Retry the request
        return this.getTimeseriesWithRetry(
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
          retryCount + 1
        )
      }

      if (response.status === 404) {
        throw new Error(
          `Entity not found: ${entityType}/${entityId} (404). Check entity ID and type.`
        )
      }

      if (response.status === 400) {
        throw new Error(
          `Bad request: ${response.data?.message || 'Invalid parameters'}`
        )
      }

      throw new Error(
        `ThingsBoard API error: ${response.status} ${response.statusText}\n${JSON.stringify(response.data)}`
      )
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Request failed: ${error.message}. Status: ${error.response?.status}`
        )
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.logger.error(`Telemetry fetch failed: ${errorMsg}`)
      }
      throw error
    }
  }

  /**
   * Helper: delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
