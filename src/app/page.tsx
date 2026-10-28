'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Moon,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  BreakDeductionStrategy,
  ShiftInput,
  VisaComplianceLevel,
  WageRules,
} from '@/types/shift';
import {
  calculateMonthlySummary,
  calculateShift,
  calculateTaxWallStatus,
  DEFAULT_WAGE_RULES,
  getVisaStatusSummary,
} from '@/lib/shiftCalculator';
import { localShiftRepository } from '@/lib/shiftRepository';

function formatYen(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function JapanVisaShiftDashboard() {
  const [shifts, setShifts] = useState<ShiftInput[]>([]);
  const [rules, setRules] = useState<WageRules>(DEFAULT_WAGE_RULES);
  const [referenceDate, setReferenceDate] = useState<string>('2026-10-26');
  const [mounted, setMounted] = useState(false);

  // Form state
  const [date, setDate] = useState('2026-10-26');
  const [startTime, setStartTime] = useState('21:30');
  const [endTime, setEndTime] = useState('06:30');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [baseHourlyYen, setBaseHourlyYen] = useState(1300);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setShifts(localShiftRepository.getAll());
    setRules(localShiftRepository.getRules());
    setMounted(true);
  }, []);

  const updateRules = (patch: Partial<WageRules>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    localShiftRepository.saveRules(next);
  };

  // Live preview of the shift currently being typed into the form
  const liveDraftPreview = useMemo(() => {
    try {
      return calculateShift(
        {
          id: 'preview',
          date,
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes) || 0,
          baseHourlyYen: Number(baseHourlyYen) || 0,
        },
        rules
      );
    } catch {
      return null;
    }
  }, [date, startTime, endTime, breakMinutes, baseHourlyYen, rules]);

  const computedShifts = useMemo(() => {
    return shifts
      .map((s) => calculateShift(s, rules))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [shifts, rules]);

  const visaSummary = useMemo(() => {
    return getVisaStatusSummary(shifts, referenceDate, rules);
  }, [shifts, referenceDate, rules]);

  const selectedYearMonth = referenceDate.slice(0, 7);
  const monthlySummary = useMemo(() => {
    return calculateMonthlySummary(shifts, selectedYearMonth, rules);
  }, [shifts, selectedYearMonth, rules]);

  const taxWallStatus = useMemo(() => {
    const year = Number(referenceDate.slice(0, 4)) || 2026;
    const month = Number(referenceDate.slice(5, 7)) || 10;
    return calculateTaxWallStatus(shifts, year, month, rules);
  }, [shifts, referenceDate, rules]);

  const handleAddShift = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const candidate: ShiftInput = {
        id: crypto.randomUUID(),
        date,
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes),
        baseHourlyYen: Number(baseHourlyYen),
        note: note.trim() || undefined,
      };
      // Validate calculation before saving
      calculateShift(candidate, rules);
      const updated = localShiftRepository.save(candidate);
      setShifts(updated);
      setReferenceDate(date);
      setNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid shift parameters');
    }
  };

  const handleDeleteShift = (id: string) => {
    setShifts(localShiftRepository.remove(id));
  };

  const applyPreset = (
    presetStart: string,
    presetEnd: string,
    presetBreak: number,
    presetNote: string
  ) => {
    setStartTime(presetStart);
    setEndTime(presetEnd);
    setBreakMinutes(presetBreak);
    setNote(presetNote);
  };

  const badgeStyles = (status: VisaComplianceLevel) => {
    if (status === 'VIOLATION') {
      return 'bg-red-500/15 text-red-400 border-red-500/40';
    }
    if (status === 'WARNING') {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    }
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40';
  };

  const gaugeBarColor = (status: VisaComplianceLevel) => {
    if (status === 'VIOLATION') return 'bg-red-500';
    if (status === 'WARNING') return 'bg-amber-400';
    return 'bg-emerald-500';
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400 animate-pulse">
          Loading Japan Visa Shift & Wage Engine...
        </p>
      </div>
    );
  }

  const rollingPct = Math.min(
    100,
    (visaSummary.currentRolling7Day.totalHours / visaSummary.activeLimitHours) * 100
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                資格外活動許可 • 28h Rule Engine
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                深夜割増 1.25x (22:00–05:00)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
              Japan Student Visa Shift & Wage Tracker
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Vacation Mode Toggle */}
            <button
              type="button"
              onClick={() =>
                updateRules({ isVacationPeriod: !rules.isVacationPeriod })
              }
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition flex items-center gap-2 ${
                rules.isVacationPeriod
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              {rules.isVacationPeriod
                ? 'Official School Vacation (40h Limit)'
                : 'Regular Semester (28h Limit)'}
            </button>

            {/* Inspection Reference Date */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-xs text-slate-400">Audit Date:</span>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="bg-transparent text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Top Row: Visa Safety Gauge + Monthly Payout + Tax Wall */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Rolling 7-Day Visa Compliance Gauge */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Rolling 7-Day Visa Window
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyles(
                    visaSummary.currentRolling7Day.status
                  )}`}
                >
                  {visaSummary.currentRolling7Day.status === 'VIOLATION' && (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  {visaSummary.currentRolling7Day.status === 'WARNING' && (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  {visaSummary.currentRolling7Day.status === 'SAFE' && (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {visaSummary.currentRolling7Day.status}
                </span>
              </div>

              <p className="text-xs text-slate-400 mt-1 font-mono">
                {visaSummary.currentRolling7Day.windowStartDate} →{' '}
                {visaSummary.currentRolling7Day.windowEndDate} (7 Consecutive Days)
              </p>

              <div className="mt-4 flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-extrabold text-white">
                    {visaSummary.currentRolling7Day.totalHours}h
                  </span>
                  <span className="text-sm text-slate-400 ml-1">
                    / {visaSummary.activeLimitHours}h limit
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Remaining Safe</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {visaSummary.currentRolling7Day.remainingHours}h left
                  </span>
                </div>
              </div>

              {/* Progress Gauge */}
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full transition-all duration-300 ${gaugeBarColor(
                    visaSummary.currentRolling7Day.status
                  )}`}
                  style={{ width: `${rollingPct}%` }}
                />
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Fixed Week (Mon–Sun)</span>
                <span className="font-semibold text-white mt-0.5 block">
                  {visaSummary.currentFixedWeek.totalHours}h /{' '}
                  {visaSummary.activeLimitHours}h (
                  {visaSummary.currentFixedWeek.remainingHours}h left)
                </span>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Peak 7-Day (30d Audit)</span>
                <span
                  className={`font-semibold mt-0.5 block ${
                    visaSummary.peakRolling7DayLast30Days.status === 'VIOLATION'
                      ? 'text-red-400'
                      : 'text-white'
                  }`}
                >
                  {visaSummary.peakRolling7DayLast30Days.totalHours}h (ends{' '}
                  {visaSummary.peakRolling7DayLast30Days.windowEndDate.slice(5)})
                </span>
              </div>
            </div>
          </section>

          {/* Card 2: Monthly Payout & Night Premium Breakdown */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Monthly Wage Forecast ({monthlySummary.yearMonth})
                </span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>

              <div className="mt-3">
                <span className="text-3xl font-extrabold text-white">
                  {formatYen(monthlySummary.totalPayoutYen)}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Across {monthlySummary.shiftCount} shifts (
                  {monthlySummary.totalWorkedHours} net hrs)
                </p>
              </div>

              <div className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-300">
                    Base Hourly Wages (1.0x • {monthlySummary.totalWorkedHours}h)
                  </span>
                  <span className="font-mono font-semibold text-slate-100">
                    {formatYen(monthlySummary.totalBaseYen)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-indigo-950/30 px-3 py-2 rounded-lg border border-indigo-500/30">
                  <span className="text-xs text-indigo-300 flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5" />
                    Night Premium Bonus (+25% • {monthlySummary.nightHours}h)
                  </span>
                  <span className="font-mono font-bold text-indigo-300">
                    +{formatYen(monthlySummary.totalNightPremiumYen)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Standard Hours: {monthlySummary.standardHours}h</span>
              <span>Night Window (22:00–05:00): {monthlySummary.nightHours}h</span>
            </div>
          </section>

          {/* Card 3: Annual Tax & Dependent Wall Tracker */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  {taxWallStatus.year} Tax & Dependent Walls
                </span>
                <Sparkles className="w-4 h-4 text-sky-400" />
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-extrabold text-white">
                    {formatYen(taxWallStatus.cumulativeAnnualYen)}
                  </span>
                  <span className="text-xs text-slate-400 block">
                    YTD Logged Income
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-sky-400">
                    {formatYen(taxWallStatus.projectedAnnualYen)}
                  </span>
                  <span className="text-xs text-slate-400 block">
                    Annualized Pace
                  </span>
                </div>
              </div>

              {/* 1.03M Wall */}
              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">¥1,030,000 Income Tax Wall</span>
                    <span className="font-mono text-slate-400">
                      {formatYen(taxWallStatus.remainingTo103WallYen)} buffer
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (taxWallStatus.cumulativeAnnualYen /
                            taxWallStatus.incomeTaxWallYen) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* 1.30M Wall */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">
                      ¥1,300,000 Social Insurance Wall
                    </span>
                    <span className="font-mono text-slate-400">
                      {formatYen(taxWallStatus.remainingTo130WallYen)} buffer
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (taxWallStatus.cumulativeAnnualYen /
                            taxWallStatus.socialInsuranceWallYen) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Break Rule:</span>
              <select
                value={rules.breakDeductionStrategy}
                onChange={(e) =>
                  updateRules({
                    breakDeductionStrategy: e.target
                      .value as BreakDeductionStrategy,
                  })
                }
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="STANDARD_FIRST">
                  Deduct Break from Standard Hours First
                </option>
                <option value="NIGHT_FIRST">
                  Deduct Break from Night Hours First
                </option>
                <option value="PROPORTIONAL">Deduct Break Proportionally</option>
              </select>
            </div>
          </section>
        </div>

        {/* Bottom Grid: Log Shift Form + Logged Shift Breakdown Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Shift Logger Form (4 Columns) */}
          <section className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Log Part-Time Shift
              </h2>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    applyPreset('21:30', '06:30', 60, 'Overnight Warehouse')
                  }
                  className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  21:30–06:30
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset('17:00', '23:00', 30, 'Evening Konbini')
                  }
                  className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  17:00–23:00
                </button>
              </div>
            </div>

            <form onSubmit={handleAddShift} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Shift Start Date (JST)
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Unpaid Break (Mins)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    required
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Base Wage (¥ / hr)
                  </label>
                  <input
                    type="number"
                    min={900}
                    max={10000}
                    required
                    value={baseHourlyYen}
                    onChange={(e) => setBaseHourlyYen(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Workplace / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Amazon FC Night Shift"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              {/* Instant Live Split Preview */}
              {liveDraftPreview && (
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-200">
                    <span>
                      Live Calculation (
                      {liveDraftPreview.isOvernight ? 'Overnight +1d' : 'Same-Day'})
                    </span>
                    <span className="text-emerald-400 font-mono text-sm">
                      {formatYen(liveDraftPreview.totalPayYen)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1 border-t border-slate-800">
                    <div>
                      Standard (1.0x):{' '}
                      <span className="text-slate-200 font-mono">
                        {liveDraftPreview.netStandardHours}h
                      </span>
                    </div>
                    <div>
                      Night (1.25x):{' '}
                      <span className="text-indigo-300 font-mono">
                        {liveDraftPreview.netNightHours}h
                      </span>
                    </div>
                    <div>
                      Base Yen:{' '}
                      <span className="text-slate-200 font-mono">
                        {formatYen(
                          liveDraftPreview.normalBaseYen +
                            liveDraftPreview.nightBaseYen
                        )}
                      </span>
                    </div>
                    <div>
                      Night 25% Bonus:{' '}
                      <span className="text-indigo-300 font-mono">
                        +{formatYen(liveDraftPreview.nightPremiumYen)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/30 rounded-lg p-2.5">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl shadow flex items-center justify-center gap-2 transition"
              >
                <Plus className="w-4 h-4" />
                Save Shift & Update Visa Gauge
              </button>
            </form>
          </section>

          {/* Shift History & Precision Wage Breakdown Table (8 Columns) */}
          <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  Logged Shifts & Night Premium Split
                </h2>
                <p className="text-xs text-slate-400">
                  Click any shift date to inspect the 7-day rolling window ending on
                  that day
                </p>
              </div>
              {shifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    localShiftRepository.clearAll();
                    setShifts([]);
                  }}
                  className="text-xs text-slate-400 hover:text-red-400 transition"
                >
                  Clear All
                </button>
              )}
            </div>

            {computedShifts.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-400 text-sm">
                No shifts logged yet. Add a shift on the left to calculate your
                visa hours and night shift multiplier.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-2">Date / Shift</th>
                      <th className="py-3 px-2">Net Hours</th>
                      <th className="py-3 px-2">Standard vs. Night</th>
                      <th className="py-3 px-2">Base Yen (1.0x)</th>
                      <th className="py-3 px-2">Night Bonus (+25%)</th>
                      <th className="py-3 px-2 text-right">Total Payout</th>
                      <th className="py-3 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-sm">
                    {computedShifts.map((s) => {
                      const rollingOnShiftDate = getVisaStatusSummary(
                        shifts,
                        s.date,
                        rules
                      ).currentRolling7Day;

                      return (
                        <tr
                          key={s.id}
                          onClick={() => setReferenceDate(s.date)}
                          className={`cursor-pointer transition hover:bg-slate-800/50 ${
                            referenceDate === s.date ? 'bg-indigo-950/25' : ''
                          }`}
                        >
                          <td className="py-3 px-2">
                            <div className="font-mono font-semibold text-white flex items-center gap-2">
                              {s.date}
                              {s.isOvernight && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  +1d
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              {s.startTime}–{s.endTime} ({s.breakMinutes}m break)
                            </div>
                            {s.note && (
                              <div className="text-xs text-slate-400 truncate max-w-[180px]">
                                {s.note}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-2">
                            <span className="font-mono font-bold text-white">
                              {s.netWorkedHours}h
                            </span>
                            <span
                              className={`block text-[11px] font-mono ${
                                rollingOnShiftDate.status === 'VIOLATION'
                                  ? 'text-red-400 font-semibold'
                                  : rollingOnShiftDate.status === 'WARNING'
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              7d roll: {rollingOnShiftDate.totalHours}h
                            </span>
                          </td>

                          <td className="py-3 px-2 text-xs font-mono">
                            <div className="text-slate-300">
                              Std: {s.netStandardHours}h
                            </div>
                            <div className="text-indigo-300">
                              Night: {s.netNightHours}h
                            </div>
                          </td>

                          <td className="py-3 px-2 font-mono text-xs text-slate-200">
                            {formatYen(s.normalBaseYen + s.nightBaseYen)}
                            <span className="block text-[10px] text-slate-400">
                              @{formatYen(s.baseHourlyYen)}/h
                            </span>
                          </td>

                          <td className="py-3 px-2 font-mono text-xs">
                            {s.nightPremiumYen > 0 ? (
                              <span className="text-indigo-300 font-semibold">
                                +{formatYen(s.nightPremiumYen)}
                              </span>
                            ) : (
                              <span className="text-slate-500">¥0</span>
                            )}
                          </td>

                          <td className="py-3 px-2 font-mono font-bold text-emerald-400 text-right">
                            {formatYen(s.totalPayYen)}
                          </td>

                          <td
                            className="py-3 px-2 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleDeleteShift(s.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                              title="Delete Shift"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}