import { logger } from '../utils/logger.js'

const kpiLogger = logger.child({ module: 'KPICalculatorService' })

export interface TelemetryDataPoint {
  ts: number
  value: number
  key: string
}

export interface KPIValues {
  instantaneousConsumption: number
  consumedThisHour: number
  consumedToday: number
  consumedYesterday: number
  consumedDayBeforeYesterday: number
  consumedThisMonth: number
  consumedLastMonth: number
  timestamp: number
}

export interface KPICalculationDebug {
  activepower_thisHour_points: number
  activepower_today_points: number
  accumulated_total_points: number
  accumulated_thisMonth_points: number
  calculations: Record<string, any>
}

const TIME_INTERVALS = {
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
}

/**
 * KPI Calculator Service
 * Calculates energy consumption KPIs from raw telemetry data
 */
export class KPICalculatorService {
  private logger = kpiLogger

  calculateKPIs(
    allData: TelemetryDataPoint[],
    deviceName: string = 'Unknown',
    includeDebug?: boolean
  ): any {
    const now = Date.now()

    // Separate data by key
    const activePowerData = allData.filter((d) => d.key === 'ActivePowerTotal').sort((a, b) => a.ts - b.ts)
    const accumulatedData = allData
      .filter((d) => d.key === 'AccumulatedActiveEnergyDelivered')
      .sort((a, b) => a.ts - b.ts)

    this.logger.info(`[KPI] Calculating for ${deviceName}:`, {
      totalPoints: allData.length,
      activePowerPoints: activePowerData.length,
      accumulatedPoints: accumulatedData.length,
    })

    // 1. Instantaneous Consumption: Latest ActivePowerTotal value
    const instantaneousConsumption = activePowerData.length > 0 ? activePowerData[activePowerData.length - 1].value : 0

    // 2. Consumed This Hour
    const { value: consumedThisHour, details: thisHourDetails } = this.calculateConsumedThisHour(activePowerData, now)

    // 3. Consumed Today
    const { value: consumedToday, details: todayDetails } = this.calculateConsumedToday(activePowerData, now)

    // 4. Consumed Yesterday
    const { value: consumedYesterday, details: yesterdayDetails } = this.calculateConsumedYesterday(accumulatedData, now)

    // 5. Consumed Day Before Yesterday
    const { value: consumedDayBefore, details: dayBeforeDetails } = this.calculateConsumedDayBefore(
      accumulatedData,
      now
    )

    // 6. Consumed This Month
    const { value: consumedThisMonth, details: thisMonthDetails } = this.calculateConsumedThisMonth(
      accumulatedData,
      now
    )

    // 7. Consumed Last Month
    const { value: consumedLastMonth, details: lastMonthDetails } = this.calculateConsumedLastMonth(
      accumulatedData,
      now
    )

    const kpis: KPIValues = {
      instantaneousConsumption,
      consumedThisHour,
      consumedToday,
      consumedYesterday,
      consumedDayBeforeYesterday: consumedDayBefore,
      consumedThisMonth,
      consumedLastMonth,
      timestamp: now,
    }

    this.logger.info(`[KPI] ✅ Calculations complete for ${deviceName}:`, {
      instantaneousConsumption: kpis.instantaneousConsumption.toFixed(2),
      consumedThisHour: kpis.consumedThisHour.toFixed(2),
      consumedToday: kpis.consumedToday.toFixed(2),
      consumedYesterday: kpis.consumedYesterday.toFixed(2),
      consumedThisMonth: kpis.consumedThisMonth.toFixed(2),
    })

    const result: any = { kpis }

    if (includeDebug) {
      result.debug = {
        activepower_thisHour_points: activePowerData.filter((d) => d.ts > now - TIME_INTERVALS.ONE_HOUR).length,
        activepower_today_points: activePowerData.filter(
          (d) => d.ts >= this.getTodayStart(now)
        ).length,
        accumulated_total_points: accumulatedData.length,
        accumulated_thisMonth_points: accumulatedData.filter((d) => d.ts >= this.getMonthStart(now)).length,
        calculations: {
          consumedThisHour: {
            method: 'Average ActivePowerTotal (kW) over last hour',
            value: consumedThisHour,
            details: thisHourDetails,
          },
          consumedToday: {
            method: 'Average ActivePowerTotal (kW) since midnight × hours elapsed',
            value: consumedToday,
            details: todayDetails,
          },
          consumedYesterday: {
            method: 'AccumulatedActiveEnergyDelivered[yesterday end] - [yesterday start]',
            value: consumedYesterday,
            details: yesterdayDetails,
          },
          consumedDayBefore: {
            method: 'AccumulatedActiveEnergyDelivered[day before end] - [day before start]',
            value: consumedDayBefore,
            details: dayBeforeDetails,
          },
          consumedThisMonth: {
            method: 'Latest AccumulatedActiveEnergyDelivered - [month start value]',
            value: consumedThisMonth,
            details: thisMonthDetails,
          },
          consumedLastMonth: {
            method: 'AccumulatedActiveEnergyDelivered[previous month]',
            value: consumedLastMonth,
            details: lastMonthDetails,
          },
        },
      }
    }

    return result
  }

  private calculateConsumedThisHour(
    activePowerData: TelemetryDataPoint[],
    now: number
  ): { value: number; details: any } {
    const hourAgo = now - TIME_INTERVALS.ONE_HOUR
    const pointsThisHour = activePowerData.filter((d) => d.ts > hourAgo)

    let value = 0
    const details: any = {
      pointsCount: pointsThisHour.length,
      avgPower: 0,
      timeSpan: '1 hour',
    }

    if (pointsThisHour.length > 0) {
      const avgPower = pointsThisHour.reduce((sum, p) => sum + p.value, 0) / pointsThisHour.length
      value = (avgPower / 1000) * 1 // Convert kW to kWh over 1 hour
      details.avgPower = Number(avgPower.toFixed(2))
    }

    return { value, details }
  }

  private calculateConsumedToday(
    activePowerData: TelemetryDataPoint[],
    now: number
  ): { value: number; details: any } {
    const todayStart = this.getTodayStart(now)
    const pointsToday = activePowerData.filter((d) => d.ts >= todayStart)

    let value = 0
    const hoursElapsed = (now - todayStart) / TIME_INTERVALS.ONE_HOUR
    const details: any = {
      pointsCount: pointsToday.length,
      hoursElapsed: Number(hoursElapsed.toFixed(2)),
      avgPower: 0,
    }

    if (pointsToday.length > 0) {
      const avgPower = pointsToday.reduce((sum, p) => sum + p.value, 0) / pointsToday.length
      value = (avgPower / 1000) * hoursElapsed
      details.avgPower = Number(avgPower.toFixed(2))
    }

    return { value, details }
  }

  private calculateConsumedYesterday(
    accumulatedData: TelemetryDataPoint[],
    now: number
  ): { value: number; details: any } {
    let value = 0
    const details: any = {
      pointsCount: accumulatedData.length,
      method: 'accumulated_difference',
      found: false,
    }

    if (accumulatedData.length >= 2) {
      const yesterdayStartMs = now - 2 * TIME_INTERVALS.ONE_DAY
      const yesterdayEndMs = now - TIME_INTERVALS.ONE_DAY

      const yesterdayStart = accumulatedData.find((d) => d.ts >= yesterdayStartMs && d.ts <= yesterdayEndMs)
      const yesterdayEnd = accumulatedData.find((d) => d.ts > yesterdayEndMs && d.ts <= now)

      if (yesterdayStart && yesterdayEnd) {
        value = yesterdayEnd.value - yesterdayStart.value
        details.found = true
        details.startValue = yesterdayStart.value
        details.endValue = yesterdayEnd.value
      } else if (accumulatedData.length >= 2) {
        // Fallback: use last two points
        value = accumulatedData[accumulatedData.length - 1].value - accumulatedData[accumulatedData.length - 2].value
        details.found = true
        details.method = 'last_two_points_fallback'
        details.startValue = accumulatedData[accumulatedData.length - 2].value
        details.endValue = accumulatedData[accumulatedData.length - 1].value
      }
    }

    return { value, details }
  }

  private calculateConsumedDayBefore(
    accumulatedData: TelemetryDataPoint[],
    now: number
  ): { value: number; details: any } {
    let value = 0
    const details: any = {
      pointsCount: accumulatedData.length,
      method: 'accumulated_difference',
      found: false,
    }

    if (accumulatedData.length >= 3) {
      value = accumulatedData[accumulatedData.length - 2].value - accumulatedData[accumulatedData.length - 3].value
      details.found = true
      details.startValue = accumulatedData[accumulatedData.length - 3].value
      details.endValue = accumulatedData[accumulatedData.length - 2].value
    }

    return { value, details }
  }

  private calculateConsumedThisMonth(
    accumulatedData: TelemetryDataPoint[],
    now: number
  ): { value: number; details: any } {
    let value = 0
    const monthStart = this.getMonthStart(now)
    const details: any = {
      pointsCount: accumulatedData.length,
      monthStart: new Date(monthStart).toISOString(),
      found: false,
    }

    if (accumulatedData.length >= 1) {
      const latestAccumulated = accumulatedData[accumulatedData.length - 1]
      const monthStartAccumulated = accumulatedData.find((d) => d.ts >= monthStart) || accumulatedData[0]

      value = latestAccumulated.value - monthStartAccumulated.value
      details.found = true
      details.startValue = monthStartAccumulated.value
      details.endValue = latestAccumulated.value
      details.startTimestamp = monthStartAccumulated.ts
      details.endTimestamp = latestAccumulated.ts
    }

    return { value, details }
  }

  private calculateConsumedLastMonth(
    accumulatedData: TelemetryDataPoint[],
    now: number
  ): { value: number; details: any } {
    let value = 0
    const monthStart = this.getMonthStart(now)
    const details: any = {
      pointsCount: accumulatedData.length,
      method: 'previous_month_data',
      found: false,
    }

    if (accumulatedData.length >= 2) {
      const dataBeforeThisMonth = accumulatedData.filter((d) => d.ts < monthStart).sort((a, b) => b.ts - a.ts)

      if (dataBeforeThisMonth.length >= 2) {
        value = dataBeforeThisMonth[0].value - dataBeforeThisMonth[dataBeforeThisMonth.length - 1].value
        details.found = true
        details.startValue = dataBeforeThisMonth[dataBeforeThisMonth.length - 1].value
        details.endValue = dataBeforeThisMonth[0].value
      }
    }

    return { value, details }
  }

  private getTodayStart(timestamp: number): number {
    const date = new Date(timestamp)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }

  private getMonthStart(timestamp: number): number {
    const date = new Date(timestamp)
    date.setDate(1)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
}
