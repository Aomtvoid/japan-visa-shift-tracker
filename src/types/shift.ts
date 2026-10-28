export type BreakDeductionStrategy =
  | 'STANDARD_FIRST' // Deducts break from 1.0x hours first (worker-favorable)
  | 'NIGHT_FIRST'    // Deducts break from 1.25x hours first (when break is strictly inside 22:00-05:00)
  | 'PROPORTIONAL';  // Deducts break proportionally across standard and night hours

export interface WageRules {
  nightMultiplier: number; // Default: 1.25 (Japanese Labor Standards Act Art. 37)
  nightStartHour: number;  // Default: 22 (22:00 JST)
  nightEndHour: number;    // Default: 5  (05:00 JST)
  breakDeductionStrategy: BreakDeductionStrategy;
  isVacationPeriod: boolean; // False = 28h limit, True = 40h limit
  weeklyHourLimitStandard: number; // Default: 28
  weeklyHourLimitVacation: number; // Default: 40
  warningThresholdHours: number;   // Default: 25
}

export interface ShiftInput {
  id: string;
  date: string;         // YYYY-MM-DD (JST start date of shift)
  startTime: string;    // HH:mm (24-hour format, e.g., "21:30")
  endTime: string;      // HH:mm (24-hour format, e.g., "06:30" - automatically detects overnight if <= startTime)
  breakMinutes: number; // Unpaid break in minutes (e.g., 60)
  baseHourlyYen: number;// Base hourly wage in JPY (e.g., 1250)
  note?: string;
}

export interface ComputedShift extends ShiftInput {
  isOvernight: boolean;
  grossTotalMinutes: number;
  grossStandardMinutes: number;
  grossNightMinutes: number;
  netWorkedMinutes: number;
  netStandardMinutes: number;
  netNightMinutes: number;
  netWorkedHours: number;
  netStandardHours: number;
  netNightHours: number;
  // JPY Breakdown
  normalBaseYen: number;      // 1.0x pay for standard hours
  nightBaseYen: number;       // 1.0x base portion of night hours
  nightPremiumYen: number;    // 0.25x statutory night bonus (深夜割増分)
  totalNightYen: number;      // 1.25x total for night hours (nightBaseYen + nightPremiumYen)
  totalPayYen: number;        // Final shift payout in JPY
}

export type VisaComplianceLevel = 'SAFE' | 'WARNING' | 'VIOLATION';

export interface RollingWindowResult {
  windowStartDate: string; // YYYY-MM-DD (inclusive, D-6)
  windowEndDate: string;   // YYYY-MM-DD (inclusive, D)
  totalMinutes: number;
  totalHours: number;
  remainingHours: number;
  limitHours: number;
  status: VisaComplianceLevel;
}

export interface VisaStatusSummary {
  referenceDate: string;
  activeLimitHours: number;
  isVacationPeriod: boolean;
  // Rolling 7-day window ending on referenceDate (D-6 through D)
  currentRolling7Day: RollingWindowResult;
  // Highest 7-day rolling window ending within the last 30 days (catches rolling violations)
  peakRolling7DayLast30Days: RollingWindowResult;
  // Fixed calendar week (Monday to Sunday) containing referenceDate
  currentFixedWeek: {
    mondayDate: string;
    sundayDate: string;
    totalHours: number;
    remainingHours: number;
    status: VisaComplianceLevel;
  };
}

export interface PayPeriodSummary {
  yearMonth: string; // YYYY-MM
  shiftCount: number;
  totalWorkedHours: number;
  standardHours: number;
  nightHours: number;
  totalBaseYen: number;        // All 1.0x wages combined (standard + night base)
  totalNightPremiumYen: number;// All 0.25x night bonus yen
  totalPayoutYen: number;      // Total gross JPY for the month
}

export interface TaxWallStatus {
  year: number;
  cumulativeAnnualYen: number;
  projectedAnnualYen: number;
  incomeTaxWallYen: number;      // ¥1,030,000 (National income tax / dependent deduction threshold)
  socialInsuranceWallYen: number;// ¥1,300,000 (Health/Pension dependent disqualification threshold)
  remainingTo103WallYen: number;
  remainingTo130WallYen: number;
}

export interface ShiftRepository {
  getAll(): ShiftInput[];
  save(shift: ShiftInput): ShiftInput[];
  remove(id: string): ShiftInput[];
  clearAll(): void;
  getRules(): WageRules;
  saveRules(rules: WageRules): void;
}