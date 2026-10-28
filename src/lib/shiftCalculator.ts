import {
  BreakDeductionStrategy,
  ComputedShift,
  PayPeriodSummary,
  RollingWindowResult,
  ShiftInput,
  TaxWallStatus,
  VisaComplianceLevel,
  VisaStatusSummary,
  WageRules,
} from '@/types/shift';

export const DEFAULT_WAGE_RULES: WageRules = {
  nightMultiplier: 1.25,
  nightStartHour: 22,
  nightEndHour: 5,
  breakDeductionStrategy: 'STANDARD_FIRST',
  isVacationPeriod: false,
  weeklyHourLimitStandard: 28,
  weeklyHourLimitVacation: 40,
  warningThresholdHours: 25,
};

/**
 * Parses "HH:mm" into minutes from 00:00.
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:mm.`);
  }
  return hours * 60 + minutes;
}

/**
 * Calculates exact overlap in minutes between [startA, endA] and [startB, endB].
 */
function getIntervalOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

/**
 * Adds `days` to a YYYY-MM-DD date string using pure UTC calendar arithmetic
 * so browser timezone offsets never corrupt JST date boundaries.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns the Monday (YYYY-MM-DD) and Sunday (YYYY-MM-DD) of the week containing `dateStr`.
 */
export function getMondayToSundayBounds(dateStr: string): {
  monday: string;
  sunday: string;
} {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = addDays(dateStr, diffToMonday);
  const sunday = addDays(monday, 6);
  return { monday, sunday };
}

/**
 * Splits a shift across standard and night (22:00–05:00) windows,
 * applies unpaid break deduction strategy, and computes exact JPY payout.
 */
export function calculateShift(
  shift: ShiftInput,
  rules: WageRules = DEFAULT_WAGE_RULES
): ComputedShift {
  const startMin = parseTimeToMinutes(shift.startTime);
  let endMin = parseTimeToMinutes(shift.endTime);

  const isOvernight = endMin <= startMin;
  if (isOvernight) {
    endMin += 24 * 60; // Extend into next day (+1440 mins)
  }

  const grossTotalMinutes = endMin - startMin;
  if (grossTotalMinutes <= 0 || grossTotalMinutes > 24 * 60) {
    throw new Error('Shift duration must be between 1 minute and 24 hours.');
  }

  if (shift.breakMinutes < 0 || shift.breakMinutes >= grossTotalMinutes) {
    throw new Error('Break minutes must be >= 0 and less than total shift duration.');
  }

  // Canonical 22:00–05:00 night windows across Day 0 and Day 1 in minute-space:
  // Window A: 00:00 to 05:00 on Day 0 -> [0, 300]
  // Window B: 22:00 on Day 0 to 05:00 on Day 1 -> [1320, 1740]
  // Window C: 22:00 on Day 1 to 05:00 on Day 2 -> [2760, 3180]
  const nightWindows: Array<[number, number]> = [
    [0, rules.nightEndHour * 60],
    [rules.nightStartHour * 60, 24 * 60 + rules.nightEndHour * 60],
    [24 * 60 + rules.nightStartHour * 60, 48 * 60 + rules.nightEndHour * 60],
  ];

  let grossNightMinutes = 0;
  for (const [wStart, wEnd] of nightWindows) {
    grossNightMinutes += getIntervalOverlap(startMin, endMin, wStart, wEnd);
  }

  const grossStandardMinutes = grossTotalMinutes - grossNightMinutes;

  // Apply break deduction strategy
  const { netStandardMinutes, netNightMinutes } = deductBreakMinutes(
    grossStandardMinutes,
    grossNightMinutes,
    shift.breakMinutes,
    rules.breakDeductionStrategy
  );

  const netWorkedMinutes = netStandardMinutes + netNightMinutes;
  const netWorkedHours = Number((netWorkedMinutes / 60).toFixed(2));
  const netStandardHours = Number((netStandardMinutes / 60).toFixed(2));
  const netNightHours = Number((netNightMinutes / 60).toFixed(2));

  // Wage calculations (Japanese payroll rounds fractional yen to nearest integer)
  const premiumRate = Math.max(0, rules.nightMultiplier - 1); // 0.25
  const normalBaseYen = Math.round((netStandardMinutes / 60) * shift.baseHourlyYen);
  const nightBaseYen = Math.round((netNightMinutes / 60) * shift.baseHourlyYen);
  const nightPremiumYen = Math.round(
    (netNightMinutes / 60) * shift.baseHourlyYen * premiumRate
  );
  const totalNightYen = nightBaseYen + nightPremiumYen;
  const totalPayYen = normalBaseYen + totalNightYen;

  return {
    ...shift,
    isOvernight,
    grossTotalMinutes,
    grossStandardMinutes,
    grossNightMinutes,
    netWorkedMinutes,
    netStandardMinutes,
    netNightMinutes,
    netWorkedHours,
    netStandardHours,
    netNightHours,
    normalBaseYen,
    nightBaseYen,
    nightPremiumYen,
    totalNightYen,
    totalPayYen,
  };
}

/**
 * Deducts unpaid break minutes from gross standard and night minutes.
 */
export function deductBreakMinutes(
  grossStandardMinutes: number,
  grossNightMinutes: number,
  breakMinutes: number,
  strategy: BreakDeductionStrategy
): { netStandardMinutes: number; netNightMinutes: number } {
  if (breakMinutes <= 0) {
    return {
      netStandardMinutes: grossStandardMinutes,
      netNightMinutes: grossNightMinutes,
    };
  }

  if (strategy === 'STANDARD_FIRST') {
    const deductFromStandard = Math.min(grossStandardMinutes, breakMinutes);
    const remainingBreak = breakMinutes - deductFromStandard;
    const deductFromNight = Math.min(grossNightMinutes, remainingBreak);
    return {
      netStandardMinutes: grossStandardMinutes - deductFromStandard,
      netNightMinutes: grossNightMinutes - deductFromNight,
    };
  }

  if (strategy === 'NIGHT_FIRST') {
    const deductFromNight = Math.min(grossNightMinutes, breakMinutes);
    const remainingBreak = breakMinutes - deductFromNight;
    const deductFromStandard = Math.min(grossStandardMinutes, remainingBreak);
    return {
      netStandardMinutes: grossStandardMinutes - deductFromStandard,
      netNightMinutes: grossNightMinutes - deductFromNight,
    };
  }

  // PROPORTIONAL
  const totalGross = grossStandardMinutes + grossNightMinutes;
  const standardShare = Math.round((grossStandardMinutes / totalGross) * breakMinutes);
  const nightShare = breakMinutes - standardShare;
  return {
    netStandardMinutes: Math.max(0, grossStandardMinutes - standardShare),
    netNightMinutes: Math.max(0, grossNightMinutes - nightShare),
  };
}

/**
 * Evaluates compliance level against 28h (or 40h vacation) cap.
 */
export function evaluateComplianceLevel(
  workedHours: number,
  limitHours: number,
  warningThresholdHours: number
): VisaComplianceLevel {
  if (workedHours > limitHours) {
    return 'VIOLATION';
  }
  const effectiveWarning =
    limitHours > 28
      ? limitHours - (28 - warningThresholdHours)
      : warningThresholdHours;
  if (workedHours >= effectiveWarning) {
    return 'WARNING';
  }
  return 'SAFE';
}

/**
 * Calculates the rolling 7-day window ending on `targetDate` (inclusive: [targetDate - 6 days, targetDate]).
 */
export function calculateRolling7DayWindow(
  shifts: ShiftInput[],
  targetDate: string,
  rules: WageRules = DEFAULT_WAGE_RULES
): RollingWindowResult {
  const windowStartDate = addDays(targetDate, -6);
  const windowEndDate = targetDate;
  const limitHours = rules.isVacationPeriod
    ? rules.weeklyHourLimitVacation
    : rules.weeklyHourLimitStandard;

  let totalMinutes = 0;
  for (const s of shifts) {
    if (s.date >= windowStartDate && s.date <= windowEndDate) {
      const computed = calculateShift(s, rules);
      totalMinutes += computed.netWorkedMinutes;
    }
  }

  const totalHours = Number((totalMinutes / 60).toFixed(2));
  const remainingHours = Number(Math.max(0, limitHours - totalHours).toFixed(2));
  const status = evaluateComplianceLevel(
    totalHours,
    limitHours,
    rules.warningThresholdHours
  );

  return {
    windowStartDate,
    windowEndDate,
    totalMinutes,
    totalHours,
    remainingHours,
    limitHours,
    status,
  };
}

/**
 * Computes full Visa Compliance Summary including:
 * 1. Rolling 7-day window ending on `referenceDate`
 * 2. Worst-case (peak) rolling 7-day window across the last 30 days & logged shifts
 * 3. Current fixed Monday–Sunday week
 */
export function getVisaStatusSummary(
  shifts: ShiftInput[],
  referenceDate: string,
  rules: WageRules = DEFAULT_WAGE_RULES
): VisaStatusSummary {
  const activeLimitHours = rules.isVacationPeriod
    ? rules.weeklyHourLimitVacation
    : rules.weeklyHourLimitStandard;

  const currentRolling7Day = calculateRolling7DayWindow(
    shifts,
    referenceDate,
    rules
  );

  // Check every day in the last 30 days PLUS every shift date to catch rolling violations
  const candidateDates = new Set<string>();
  for (let i = 0; i < 30; i++) {
    candidateDates.add(addDays(referenceDate, -i));
  }
  for (const s of shifts) {
    candidateDates.add(s.date);
  }

  let peakRolling7DayLast30Days = currentRolling7Day;
  for (const dateStr of candidateDates) {
    const windowCheck = calculateRolling7DayWindow(shifts, dateStr, rules);
    if (windowCheck.totalMinutes > peakRolling7DayLast30Days.totalMinutes) {
      peakRolling7DayLast30Days = windowCheck;
    }
  }

  // Fixed Monday-Sunday week
  const { monday, sunday } = getMondayToSundayBounds(referenceDate);
  let fixedWeekMinutes = 0;
  for (const s of shifts) {
    if (s.date >= monday && s.date <= sunday) {
      fixedWeekMinutes += calculateShift(s, rules).netWorkedMinutes;
    }
  }
  const fixedWeekHours = Number((fixedWeekMinutes / 60).toFixed(2));

  return {
    referenceDate,
    activeLimitHours,
    isVacationPeriod: rules.isVacationPeriod,
    currentRolling7Day,
    peakRolling7DayLast30Days,
    currentFixedWeek: {
      mondayDate: monday,
      sundayDate: sunday,
      totalHours: fixedWeekHours,
      remainingHours: Number(
        Math.max(0, activeLimitHours - fixedWeekHours).toFixed(2)
      ),
      status: evaluateComplianceLevel(
        fixedWeekHours,
        activeLimitHours,
        rules.warningThresholdHours
      ),
    },
  };
}

/**
 * Aggregates monthly hours and JPY breakdown for a given "YYYY-MM".
 */
export function calculateMonthlySummary(
  shifts: ShiftInput[],
  yearMonth: string,
  rules: WageRules = DEFAULT_WAGE_RULES
): PayPeriodSummary {
  const monthShifts = shifts.filter((s) => s.date.startsWith(yearMonth));

  let totalWorkedMinutes = 0;
  let standardMinutes = 0;
  let nightMinutes = 0;
  let totalBaseYen = 0;
  let totalNightPremiumYen = 0;
  let totalPayoutYen = 0;

  for (const s of monthShifts) {
    const c = calculateShift(s, rules);
    totalWorkedMinutes += c.netWorkedMinutes;
    standardMinutes += c.netStandardMinutes;
    nightMinutes += c.netNightMinutes;
    totalBaseYen += c.normalBaseYen + c.nightBaseYen;
    totalNightPremiumYen += c.nightPremiumYen;
    totalPayoutYen += c.totalPayYen;
  }

  return {
    yearMonth,
    shiftCount: monthShifts.length,
    totalWorkedHours: Number((totalWorkedMinutes / 60).toFixed(2)),
    standardHours: Number((standardMinutes / 60).toFixed(2)),
    nightHours: Number((nightMinutes / 60).toFixed(2)),
    totalBaseYen,
    totalNightPremiumYen,
    totalPayoutYen,
  };
}

/**
 * Tracks cumulative annual income against the ¥1,030,000 and ¥1,300,000 walls.
 */
export function calculateTaxWallStatus(
  shifts: ShiftInput[],
  year: number,
  currentMonthIndex1Based: number,
  rules: WageRules = DEFAULT_WAGE_RULES
): TaxWallStatus {
  const yearPrefix = `${year}-`;
  const yearShifts = shifts.filter((s) => s.date.startsWith(yearPrefix));

  let cumulativeAnnualYen = 0;
  for (const s of yearShifts) {
    cumulativeAnnualYen += calculateShift(s, rules).totalPayYen;
  }

  const elapsedMonths = Math.max(1, Math.min(12, currentMonthIndex1Based));
  const projectedAnnualYen = Math.round(
    (cumulativeAnnualYen / elapsedMonths) * 12
  );

  const INCOME_TAX_WALL = 1_030_000;
  const SOCIAL_INSURANCE_WALL = 1_300_000;

  return {
    year,
    cumulativeAnnualYen,
    projectedAnnualYen,
    incomeTaxWallYen: INCOME_TAX_WALL,
    socialInsuranceWallYen: SOCIAL_INSURANCE_WALL,
    remainingTo103WallYen: Math.max(0, INCOME_TAX_WALL - cumulativeAnnualYen),
    remainingTo130WallYen: Math.max(
      0,
      SOCIAL_INSURANCE_WALL - cumulativeAnnualYen
    ),
  };
}