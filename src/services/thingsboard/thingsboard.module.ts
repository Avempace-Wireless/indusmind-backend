import { ThingsboardAuthService } from './thingsboard-auth.service.js'
import { ThingsboardTelemetryService } from './thingsboard-telemetry.service.js'

/**
 * Initialize ThingsBoard services
 * Returns configured instances for use in Express routes
 */
export function initializeThingsboardServices(): {
  authService: ThingsboardAuthService
  telemetryService: ThingsboardTelemetryService
} {
  const authService = new ThingsboardAuthService()
  const telemetryService = new ThingsboardTelemetryService(authService)

  return {
    authService,
    telemetryService,
  }
}
