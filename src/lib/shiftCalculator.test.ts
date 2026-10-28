import { describe, expect, it } from 'vitest';
import {
  calculateRolling7DayWindow,
  calculateShift,
  DEFAULT_WAGE_RULES,
  getVisaStatusSummary,
} from './shiftCalculator';
import { ShiftInput, WageRules } from '@/types/shift';

describe('Japan Student Visa Shift & Wage Calculator', () => {
  // TEST 1: Amazon-style overnight shift (21:30 to 06:30 with 60m break) - STANDARD_FIRST
  it('1. accurately splits an overnight 21:30-06:30 shift across 22:00 and 05:00 with STANDARD_FIRST break deduction', () => {
    const shift: ShiftInput = {
      id: 'amz-1',
      date: '2026-10-20',
      startTime: '21:30',
      endTime: '06:30',
      breakMinutes: 60,
      baseHourlyYen: 1200,
    };

    // Gross: 21:30-22:00 (30m std) + 22:00-05:00 (420m night) + 05:00-06:30 (90m std)
    // Gross Standard = 120m (2.0h), Gross Night = 420m (7.0h)
    // With 60m break deducted from STANDARD_FIRST -> Net Standard = 1.0h, Net Night = 7.0h
    const result = calculateShift(shift, {
      ...DEFAULT_WAGE_RULES,
      breakDeductionStrategy: 'STANDARD_FIRST',
    });

    expect(result.isOvernight).toBe(true);
    expect(result.grossTotalMinutes).toBe(540);
    expect(result.grossStandardMinutes).toBe(120);
    expect(result.grossNightMinutes).toBe(420);

    expect(result.netStandardHours).toBe(1);
    expect(result.netNightHours).toBe(7);
    expect(result.netWorkedHours).toBe(8);

    // Normal base: 1h * 1200 = 1200
    // Night base: 7h * 1200 = 8400
    // Night 25% bonus: 7h * 300 = 2100
    // Total payout: 1200 + 8400 + 2100 = 11700
    expect(result.normalBaseYen).toBe(1200);
    expect(result.nightBaseYen).toBe(8400);
    expect(result.nightPremiumYen).toBe(2100);
    expect(result.totalPayYen).toBe(11700);
  });

  // TEST 2: Amazon-style overnight shift (21:30 to 06:30 with 60m break) - NIGHT_FIRST
  it('2. supports NIGHT_FIRST break deduction when the 60m break is taken strictly inside 22:00-05:00', () => {
    const shift: ShiftInput = {
      id: 'amz-2',
      date: '2026-10-21',
      startTime: '21:30',
      endTime: '06:30',
      breakMinutes: 60,
      baseHourlyYen: 1200,
    };

    const result = calculateShift(shift, {
      ...DEFAULT_WAGE_RULES,
      breakDeductionStrategy: 'NIGHT_FIRST',
    });

    // Net Standard = 2.0h, Net Night = 6.0h
    expect(result.netStandardHours).toBe(2);
    expect(result.netNightHours).toBe(6);
    expect(result.normalBaseYen).toBe(2400);
    expect(result.nightBaseYen).toBe(7200);
    expect(result.nightPremiumYen).toBe(1800);
    expect(result.totalPayYen).toBe(11400);
  });

  // TEST 3: Late evening convenience store shift crossing 22:00 (17:00 to 23:30, 45m break)
  it('3. calculates partial evening night premium for a 17:00-23:30 konbini shift', () => {
    const shift: ShiftInput = {
      id: 'konbini-1',
      date: '2026-10-22',
      startTime: '17:00',
      endTime: '23:30',
      breakMinutes: 30,
      baseHourlyYen: 1150,
    };

    // 17:00-22:00 = 300m std, 22:00-23:30 = 90m night
    // Deduct 30m from standard -> 270m (4.5h) std, 90m (1.5h) night
    const result = calculateShift(shift, DEFAULT_WAGE_RULES);

    expect(result.isOvernight).toBe(false);
    expect(result.netStandardHours).toBe(4.5);
    expect(result.netNightHours).toBe(1.5);
    expect(result.normalBaseYen).toBe(Math.round(4.5 * 1150)); // 5175
    expect(result.nightPremiumYen).toBe(Math.round(1.5 * 1150 * 0.25)); // 431
    expect(result.totalPayYen).toBe(5175 + Math.round(1.5 * 1150) + 431); // 7331
  });

  // TEST 4: Classic Japanese Immigration Rolling 7-Day Window Trap
  // Week 1 (Mon-Sun) = 24h (SAFE on fixed week), Week 2 (Mon-Sun) = 24h (SAFE on fixed week),
  // but Fri-Sun (24h) + Mon-Tue (16h) = 40h within a 7-day rolling window (VIOLATION!)
  it('4. detects a 28-hour rolling 7-day visa violation even when fixed Mon-Sun weeks are under 28 hours', () => {
    const shifts: ShiftInput[] = [
      // Week 1: Fri Oct 16, Sat Oct 17, Sun Oct 18 (3 x 8h = 24h in Week 1)
      { id: '1', date: '2026-10-16', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 },
      { id: '2', date: '2026-10-17', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 },
      { id: '3', date: '2026-10-18', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 },
      // Week 2: Mon Oct 19, Tue Oct 20 (2 x 8h = 16h in Week 2)
      { id: '4', date: '2026-10-19', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 },
      { id: '5', date: '2026-10-20', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 },
    ];

    const summary = getVisaStatusSummary(shifts, '2026-10-20', DEFAULT_WAGE_RULES);

    // Fixed week (Mon Oct 19 - Sun Oct 25) only has 16 hours -> SAFE
    expect(summary.currentFixedWeek.totalHours).toBe(16);
    expect(summary.currentFixedWeek.status).toBe('SAFE');

    // Rolling 7-day window (Oct 14 - Oct 20) has 40 hours -> VIOLATION (> 28h)
    expect(summary.currentRolling7Day.totalHours).toBe(40);
    expect(summary.currentRolling7Day.status).toBe('VIOLATION');
    expect(summary.currentRolling7Day.remainingHours).toBe(0);
  });

  // TEST 5: Official School Vacation Toggle (40-Hour Limit) & 25-Hour Warning Threshold
  it('5. flags WARNING at 25+ hours during normal semester and permits up to 40 hours during school vacation', () => {
    const shifts: ShiftInput[] = [
      { id: 'v1', date: '2026-10-20', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 }, // 8h
      { id: 'v2', date: '2026-10-21', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 }, // 8h
      { id: 'v3', date: '2026-10-22', startTime: '09:00', endTime: '19:30', breakMinutes: 60, baseHourlyYen: 1200 }, // 9.5h -> Total 25.5h
    ];

    const normalCheck = calculateRolling7DayWindow(shifts, '2026-10-22', DEFAULT_WAGE_RULES);
    expect(normalCheck.totalHours).toBe(25.5);
    expect(normalCheck.status).toBe('WARNING');
    expect(normalCheck.remainingHours).toBe(2.5);

    // Add a 4th shift (+8h = 33.5h total) -> VIOLATION in semester, SAFE in vacation
    const shiftsWithFourth: ShiftInput[] = [
      ...shifts,
      { id: 'v4', date: '2026-10-23', startTime: '09:00', endTime: '18:00', breakMinutes: 60, baseHourlyYen: 1200 },
    ];

    const vacationRules: WageRules = {
      ...DEFAULT_WAGE_RULES,
      isVacationPeriod: true,
    };

    const vacationCheck = calculateRolling7DayWindow(
      shiftsWithFourth,
      '2026-10-23',
      vacationRules
    );
    expect(vacationCheck.totalHours).toBe(33.5);
    expect(vacationCheck.limitHours).toBe(40);
    expect(vacationCheck.status).toBe('SAFE');
    expect(vacationCheck.remainingHours).toBe(6.5);
  });
});