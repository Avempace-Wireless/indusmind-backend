import axios, { AxiosInstance } from 'axios'
import { logger } from '../../utils/logger.js'

const authLogger = logger.child({ module: 'ThingsboardAuthService' })

interface ThingsboardAuthResponse {
  token: string
  refreshToken: string
}

interface ThingsboardTokenPayload {
  token: string
  refreshToken: string
  expiresAt: number
}

/**
 * ThingsBoard Authentication Service
 * Handles login, token storage, refresh, and token lifecycle management
 */
export class ThingsboardAuthService {
  private logger = authLogger
  private readonly baseUrl: string
  private readonly username: string
  private readonly password: string
  private tokenPayload: ThingsboardTokenPayload | null = null
  private tokenRefreshInterval: NodeJS.Timeout | null = null

  constructor(
    baseUrl: string = process.env.THINGSBOARD_BASE_URL || 'https://portal.indusmind.net',
    username: string = process.env.THINGSBOARD_USERNAME || '',
    password: string = process.env.THINGSBOARD_PASSWORD || ''
  ) {
    this.baseUrl = baseUrl
    this.username = username
    this.password = password
    console.log('THINGSBOARD_USERNAME:', this.username)
    console.log('THINGSBOARD_PASSWORD:', this.password
    )
    console.log('THINGSBOARD_BASE_URL:', this.baseUrl)
    if (!this.username || !this.password) {
      throw new Error('ThingsBoard credentials not provided in environment variables')
    }
  }

  /**
   * Authenticate with ThingsBoard and obtain access token
   * Sets up automatic token refresh if needed
   */
  async authenticate(): Promise<string> {
    try {
      this.logger.info('Authenticating with ThingsBoard...')

      const response = await axios.post<ThingsboardAuthResponse>(
        `${this.baseUrl}/api/auth/login`,
        {
          username: this.username,
          password: this.password,
        },
        {
          timeout: 10000,
          validateStatus: () => true, // Handle all status codes
        }
      )

      if (response.status !== 200) {
        throw new Error(
          `ThingsBoard authentication failed: ${response.status} ${response.statusText}`
        )
      }

      const { token, refreshToken } = response.data

      // Store token with expiration time (JWT tokens are typically valid for 15 minutes)
      // Decode JWT to get expiration, or assume 15 minutes
      const expiresAt = this.getTokenExpiration(token)

      this.tokenPayload = {
        token,
        refreshToken,
        expiresAt,
      }

      this.logger.info(
        `Successfully authenticated. Token expires at: ${new Date(expiresAt).toISOString()}`
      )

      // Setup automatic refresh before expiration
      this.setupAutoRefresh()

      return token
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Authentication failed: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<string> {
    if (!this.tokenPayload?.refreshToken) {
      this.logger.warn('No refresh token available. Re-authenticating...')
      return this.authenticate()
    }

    try {
      this.logger.info('Refreshing ThingsBoard token...')

      const response = await axios.post<ThingsboardAuthResponse>(
        `${this.baseUrl}/api/auth/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.tokenPayload.refreshToken}`,
          },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 401) {
        // Refresh token expired, re-authenticate
        this.logger.warn('Refresh token expired. Re-authenticating...')
        return this.authenticate()
      }

      if (response.status !== 200) {
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText}`
        )
      }

      const { token, refreshToken } = response.data
      const expiresAt = this.getTokenExpiration(token)

      this.tokenPayload = {
        token,
        refreshToken,
        expiresAt,
      }

      this.logger.info(
        `Token refreshed successfully. Expires at: ${new Date(expiresAt).toISOString()}`
      )

      return token
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Token refresh failed: ${errorMsg}`)
      // Fall back to re-authentication
      return this.authenticate()
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string> {
    if (!this.tokenPayload) {
      return this.authenticate()
    }

    // Check if token is about to expire (refresh if less than 1 minute remaining)
    const now = Date.now()
    const timeUntilExpiry = this.tokenPayload.expiresAt - now

    if (timeUntilExpiry < 60000) {
      // Less than 1 minute remaining
      this.logger.info('Token expiring soon, refreshing...')
      return this.refreshToken()
    }

    return this.tokenPayload.token
  }

  /**
   * Create an axios instance with current valid token
   */
  async getAuthenticatedClient(): Promise<AxiosInstance> {
    const token = await this.getValidToken()

    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  }

  /**
   * Decode JWT to extract expiration time
   * Standard JWT expiration is in the 'exp' claim
   */
  private getTokenExpiration(token: string): number {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      // Decode the payload (second part)
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8')
      )

      // exp is in seconds, convert to milliseconds
      if (payload.exp) {
        return payload.exp * 1000
      }

      // If no exp, assume 15 minutes from now
      return Date.now() + 15 * 60 * 1000
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Could not decode token expiration: ${errorMsg}`)
      // Default to 15 minutes from now
      return Date.now() + 15 * 60 * 1000
    }
  }

  /**
   * Setup automatic token refresh before expiration
   */
  private setupAutoRefresh(): void {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval)
    }

    if (!this.tokenPayload) return

    // Schedule refresh 2 minutes before expiration
    const timeUntilExpiry = this.tokenPayload.expiresAt - Date.now()
    const refreshDelay = Math.max(timeUntilExpiry - 120000, 60000) // At least 1 minute

    this.tokenRefreshInterval = setInterval(() => {
      this.refreshToken().catch((error) => {
        this.logger.error(`Auto-refresh failed: ${error.message}`)
      })
    }, refreshDelay)

    this.logger.info(`Auto-refresh scheduled in ${refreshDelay}ms`)
  }

  /**
   * Cleanup: clear refresh interval
   */
  cleanup(): void {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval)
      this.tokenRefreshInterval = null
    }
  }

  /**
   * Get current token status (for monitoring/debugging)
   */
  getTokenStatus() {
    if (!this.tokenPayload) {
      return { status: 'not_authenticated' }
    }

    const now = Date.now()
    const expiresIn = this.tokenPayload.expiresAt - now

    return {
      status: expiresIn > 0 ? 'valid' : 'expired',
      expiresAt: new Date(this.tokenPayload.expiresAt).toISOString(),
      expiresInSeconds: Math.floor(expiresIn / 1000),
    }
  }
}
