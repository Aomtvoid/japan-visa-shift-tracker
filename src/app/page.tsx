'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Download,
  Moon,
  Plus,
  RotateCcw,
  ShieldAlert,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  BreakDeductionStrategy,
  ShiftInput,
  VisaComplianceLevel,
  WageRules,
} from '@/types/shift';
import {
  addDays,
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

  // 7-day daily breakdown for the GitHub-style contribution strip
  const sevenDayStrip = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(referenceDate, -i);
      const dayShifts = computedShifts.filter((s) => s.date === d);
      const hours = dayShifts.reduce((acc, s) => acc + s.netWorkedHours, 0);
      days.push({ date: d, hours: Number(hours.toFixed(2)) });
    }
    return days;
  }, [referenceDate, computedShifts]);

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
      calculateShift(candidate, rules);
      const updated = localShiftRepository.save(candidate);
      setShifts(updated);
      setReferenceDate(date);
      setNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid shift input');
    }
  };

  const handleDeleteShift = (id: string) => {
    setShifts(localShiftRepository.remove(id));
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ shifts, rules }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shifts-backup-${referenceDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const statusTagStyle = (status: VisaComplianceLevel) => {
    if (status === 'VIOLATION') {
      return 'bg-red-950/80 text-red-400 border-red-800';
    }
    if (status === 'WARNING') {
      return 'bg-amber-950/80 text-amber-300 border-amber-800';
    }
    return 'bg-[#0d2818] text-[#39d353] border-[#238636]';
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-400 font-mono text-xs flex items-center justify-center">
        [SYS] INITIALIZING SHIFT LEDGER...
      </div>
    );
  }

  const totalSegments = visaSummary.activeLimitHours;
  const filledSegments = Math.ceil(visaSummary.currentRolling7Day.totalHours);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-20 selection:bg-[#238636] selection:text-white">
      {/* Top Utility Bar */}
      <header className="border-b border-zinc-800 bg-[#09090b] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#0d2818] border border-[#238636] flex items-center justify-center text-[#39d353]">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-sm font-mono font-bold tracking-tight text-zinc-100 uppercase">
                JP-VISA-LEDGER // 28H-AUDIT
              </h1>
              <span className="hidden md:inline-block text-[11px] font-mono text-zinc-500">
                LSA ART.37 (22:00-05:00 @ 1.25x)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Semester vs Vacation Switch */}
            <button
              type="button"
              onClick={() =>
                updateRules({ isVacationPeriod: !rules.isVacationPeriod })
              }
              className={`px-3 py-1.5 text-xs font-mono border transition flex items-center gap-2 ${
                rules.isVacationPeriod
                  ? 'bg-[#0d2818] text-[#39d353] border-[#238636]'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  rules.isVacationPeriod ? 'bg-[#39d353]' : 'bg-zinc-500'
                }`}
              />
              {rules.isVacationPeriod ? 'VACATION_CAP: 40H' : 'SEMESTER_CAP: 28H'}
            </button>

            {/* Audit Date Selector */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 px-2.5 py-1">
              <span className="text-[11px] font-mono text-zinc-500 mr-2">
                AUDIT_DATE
              </span>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleExportJson}
              title="Export JSON Backup"
              className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-100 transition"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Top 3-Column Metrics Grid (Sharp 1px Hairline Frame) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 border border-zinc-800 bg-zinc-900/20 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
          {/* Panel 1: Rolling 7-Day Visa Telemetry */}
          <section className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  01 / ROLLING 7-DAY IMMIGRATION WINDOW
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-semibold border ${statusTagStyle(
                    visaSummary.currentRolling7Day.status
                  )}`}
                >
                  {visaSummary.currentRolling7Day.status === 'VIOLATION' && (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  {visaSummary.currentRolling7Day.status === 'WARNING' && (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  {visaSummary.currentRolling7Day.status === 'SAFE' && (
                    <Check className="w-3 h-3" />
                  )}
                  {visaSummary.currentRolling7Day.status}
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between font-mono tabular-nums">
                <div>
                  <span className="text-3xl font-bold text-white">
                    {visaSummary.currentRolling7Day.totalHours.toFixed(2)}
                  </span>
                  <span className="text-xs text-zinc-500 ml-1.5">
                    / {visaSummary.activeLimitHours}.00 HRS
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-zinc-500 block">
                    SAFE BUFFER
                  </span>
                  <span
                    className={`text-base font-bold ${
                      visaSummary.currentRolling7Day.remainingHours === 0
                        ? 'text-red-400'
                        : 'text-[#39d353]'
                    }`}
                  >
                    {visaSummary.currentRolling7Day.remainingHours.toFixed(2)}h
                  </span>
                </div>
              </div>

              {/* Segmented LED Bar (1 block = 1 hour) */}
              <div className="mt-4">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${totalSegments}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: totalSegments }).map((_, idx) => {
                    const hourIndex = idx + 1;
                    const isActive = hourIndex <= filledSegments;
                    const isWarningZone =
                      hourIndex > rules.warningThresholdHours &&
                      hourIndex <= totalSegments;

                    let cellColor = 'bg-zinc-800/80';
                    if (isActive) {
                      if (
                        visaSummary.currentRolling7Day.status === 'VIOLATION'
                      ) {
                        cellColor = 'bg-red-500';
                      } else if (isWarningZone) {
                        cellColor = 'bg-amber-400';
                      } else {
                        cellColor = 'bg-[#39d353]';
                      }
                    }

                    return (
                      <div
                        key={idx}
                        title={`Hour ${hourIndex}`}
                        className={`h-3 transition-colors ${cellColor}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1.5">
                  <span>
                    WINDOW: {visaSummary.currentRolling7Day.windowStartDate} →{' '}
                    {visaSummary.currentRolling7Day.windowEndDate}
                  </span>
                  <span>WARN @ {rules.warningThresholdHours}H</span>
                </div>
              </div>
            </div>

            {/* GitHub-Style 7-Day Contribution Strip + Fixed Week Comparison */}
            <div className="mt-5 pt-4 border-t border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-400">
                  7D ACTIVITY HEATMAP
                </span>
                <div className="flex items-center gap-1.5">
                  {sevenDayStrip.map((d) => {
                    // GitHub contribution greens based on daily hours
                    let bg = 'bg-zinc-900 border-zinc-800 text-zinc-600';
                    if (d.hours > 0 && d.hours <= 4) {
                      bg = 'bg-[#0e4429] border-[#006d32] text-zinc-200';
                    } else if (d.hours > 4 && d.hours < 8) {
                      bg = 'bg-[#006d32] border-[#26a641] text-white';
                    } else if (d.hours >= 8) {
                      bg = 'bg-[#39d353] border-[#39d353] text-black font-bold';
                    }
                    return (
                      <div
                        key={d.date}
                        title={`${d.date}: ${d.hours}h`}
                        className={`w-7 h-7 border text-[10px] font-mono flex flex-col items-center justify-center ${bg}`}
                      >
                        <span>{d.date.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="bg-zinc-950 border border-zinc-800/90 p-2">
                  <span className="text-[10px] text-zinc-500 block">
                    MON–SUN FIXED WEEK
                  </span>
                  <span className="text-zinc-200 font-semibold">
                    {visaSummary.currentFixedWeek.totalHours}h /{' '}
                    {visaSummary.activeLimitHours}h
                  </span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/90 p-2">
                  <span className="text-[10px] text-zinc-500 block">
                    30D PEAK ROLLING
                  </span>
                  <span
                    className={`font-semibold ${
                      visaSummary.peakRolling7DayLast30Days.status ===
                      'VIOLATION'
                        ? 'text-red-400'
                        : 'text-zinc-200'
                    }`}
                  >
                    {visaSummary.peakRolling7DayLast30Days.totalHours}h (
                    {visaSummary.peakRolling7DayLast30Days.windowEndDate.slice(
                      5
                    )}
                    )
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Panel 2: Monthly Gross & Night Premium Split */}
          <section className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  02 / MONTHLY PAYOUT ({monthlySummary.yearMonth})
                </span>
                <span className="text-[11px] font-mono text-[#39d353] bg-[#0d2818] border border-[#238636] px-2 py-0.5">
                  {monthlySummary.shiftCount} SHIFTS
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between font-mono tabular-nums">
                <span className="text-3xl font-bold text-white">
                  {formatYen(monthlySummary.totalPayoutYen)}
                </span>
                <span className="text-xs text-zinc-400">
                  {monthlySummary.totalWorkedHours} NET HRS
                </span>
              </div>

              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                  <span className="text-zinc-400">
                    BASE WAGE (1.00x • {monthlySummary.totalWorkedHours}h)
                  </span>
                  <span className="text-zinc-100 font-semibold tabular-nums">
                    {formatYen(monthlySummary.totalBaseYen)}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-[#0d2818]/40 border border-[#238636]/60 px-3 py-2.5">
                  <span className="text-[#39d353] flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5" />
                    NIGHT PREMIUM (+0.25x • {monthlySummary.nightHours}h)
                  </span>
                  <span className="text-[#39d353] font-bold tabular-nums">
                    +{formatYen(monthlySummary.totalNightPremiumYen)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>DAY (05:00-22:00): {monthlySummary.standardHours}h</span>
              <span className="text-[#39d353]">
                NIGHT (22:00-05:00): {monthlySummary.nightHours}h
              </span>
            </div>
          </section>

          {/* Panel 3: Tax & Dependent Wall Telemetry */}
          <section className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  03 / {taxWallStatus.year} TAX & DEPENDENT WALLS
                </span>
                <ArrowUpRight className="w-4 h-4 text-zinc-500" />
              </div>

              <div className="mt-4 flex items-baseline justify-between font-mono tabular-nums">
                <div>
                  <span className="text-2xl font-bold text-white">
                    {formatYen(taxWallStatus.cumulativeAnnualYen)}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    YTD LOGGED GROSS
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-[#39d353]">
                    {formatYen(taxWallStatus.projectedAnnualYen)}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    12M RUN-RATE
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3 font-mono">
                {/* 1.03M Wall */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">¥1,030,000 TAX WALL</span>
                    <span className="text-zinc-400 tabular-nums">
                      {formatYen(taxWallStatus.remainingTo103WallYen)} REM
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-[#2ea043]"
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
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">
                      ¥1,300,000 SOCIAL INS. WALL
                    </span>
                    <span className="text-zinc-400 tabular-nums">
                      {formatYen(taxWallStatus.remainingTo130WallYen)} REM
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-[#39d353]"
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

            <div className="mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
              <span className="text-zinc-500">BREAK DEDUCTION</span>
              <select
                value={rules.breakDeductionStrategy}
                onChange={(e) =>
                  updateRules({
                    breakDeductionStrategy: e.target
                      .value as BreakDeductionStrategy,
                  })
                }
                className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-[#238636]"
              >
                <option value="STANDARD_FIRST">STANDARD_FIRST (1.0x)</option>
                <option value="NIGHT_FIRST">NIGHT_FIRST (1.25x)</option>
                <option value="PROPORTIONAL">PROPORTIONAL</option>
              </select>
            </div>
          </section>
        </div>

        {/* Bottom Workspace: Form + Shift Ledger Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Shift Entry Console (4 cols) */}
          <section className="lg:col-span-4 border border-zinc-800 bg-zinc-900/20 p-5 h-fit">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-800">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#39d353]" />
                COMMIT SHIFT ENTRY
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    applyPreset('21:30', '06:30', 60, 'Fulfillment Night Pack')
                  }
                  className="text-[10px] font-mono px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition"
                >
                  21:30–06:30
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset('17:00', '23:00', 30, 'Evening Kitchen/Hall')
                  }
                  className="text-[10px] font-mono px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition"
                >
                  17:00–23:00
                </button>
              </div>
            </div>

            <form onSubmit={handleAddShift} className="space-y-4 font-mono">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  SHIFT_DATE (JST)
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#238636]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    START_TIME
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#238636]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    END_TIME
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#238636]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    BREAK_MINS
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    required
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#238636]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    BASE_YPH (¥)
                  </label>
                  <input
                    type="number"
                    min={900}
                    max={10000}
                    required
                    value={baseHourlyYen}
                    onChange={(e) => setBaseHourlyYen(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#238636]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  NOTE / LOCATION
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sayama Night Pack / Hall Shift"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#238636]"
                />
              </div>

              {/* Live Calculation Readout */}
              {liveDraftPreview && (
                <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
                    <span className="text-[11px] text-zinc-400">
                      EST_PAYOUT (
                      {liveDraftPreview.isOvernight ? 'OVERNIGHT +1D' : 'SAME_DAY'}
                      )
                    </span>
                    <span className="text-[#39d353] font-bold text-sm tabular-nums">
                      {formatYen(liveDraftPreview.totalPayYen)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-[11px] text-zinc-400 tabular-nums">
                    <div>
                      STD (1.0x):{' '}
                      <span className="text-zinc-200">
                        {liveDraftPreview.netStandardHours}h
                      </span>
                    </div>
                    <div>
                      NIGHT (1.25x):{' '}
                      <span className="text-[#39d353]">
                        {liveDraftPreview.netNightHours}h
                      </span>
                    </div>
                    <div>
                      BASE:{' '}
                      <span className="text-zinc-200">
                        {formatYen(
                          liveDraftPreview.normalBaseYen +
                            liveDraftPreview.nightBaseYen
                        )}
                      </span>
                    </div>
                    <div>
                      +25% BONUS:{' '}
                      <span className="text-[#39d353]">
                        +{formatYen(liveDraftPreview.nightPremiumYen)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 p-2.5">
                  [ERR] {errorMsg}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#238636] hover:bg-[#2ea043] text-white font-mono font-bold text-xs uppercase tracking-wider border border-[#39d353]/40 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                COMMIT SHIFT RECORD
              </button>
            </form>
          </section>

          {/* Right Column: High-Density Ledger Table (8 cols) */}
          <section className="lg:col-span-8 border border-zinc-800 bg-zinc-900/20 flex flex-col">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
                  SHIFT AUDIT LEDGER ({computedShifts.length} RECORDS)
                </h2>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                  Select any row to anchor the 7-day rolling compliance gauge to
                  that date
                </p>
              </div>
              {shifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    localShiftRepository.clearAll();
                    setShifts([]);
                  }}
                  className="text-[11px] font-mono text-zinc-500 hover:text-red-400 flex items-center gap-1 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  PURGE_ALL
                </button>
              )}
            </div>

            {computedShifts.length === 0 ? (
              <div className="p-12 text-center font-mono text-xs text-zinc-500">
                [EMPTY_LEDGER] No shift records committed.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="py-3 px-4">DATE / WINDOW</th>
                      <th className="py-3 px-3">NET HRS</th>
                      <th className="py-3 px-3">SPLIT (1.0x / 1.25x)</th>
                      <th className="py-3 px-3">BASE (1.0x)</th>
                      <th className="py-3 px-3">NIGHT (+25%)</th>
                      <th className="py-3 px-4 text-right">GROSS JPY</th>
                      <th className="py-3 px-3 text-right">DEL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 text-xs">
                    {computedShifts.map((s) => {
                      const rollingOnShiftDate = getVisaStatusSummary(
                        shifts,
                        s.date,
                        rules
                      ).currentRolling7Day;
                      const isSelected = referenceDate === s.date;

                      return (
                        <tr
                          key={s.id}
                          onClick={() => setReferenceDate(s.date)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-[#0d2818]/50 border-l-2 border-l-[#39d353]'
                              : 'hover:bg-zinc-900/80'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-zinc-100 flex items-center gap-2">
                              {s.date}
                              {s.isOvernight && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  +1D
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {s.startTime}→{s.endTime} (-{s.breakMinutes}m)
                            </div>
                            {s.note && (
                              <div className="text-[11px] text-zinc-400 truncate max-w-[190px]">
                                {s.note}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className="font-bold text-white">
                              {s.netWorkedHours.toFixed(2)}h
                            </span>
                            <span
                              className={`block text-[10px] ${
                                rollingOnShiftDate.status === 'VIOLATION'
                                  ? 'text-red-400 font-bold'
                                  : rollingOnShiftDate.status === 'WARNING'
                                  ? 'text-amber-400'
                                  : 'text-zinc-500'
                              }`}
                            >
                              7D: {rollingOnShiftDate.totalHours}h
                            </span>
                          </td>

                          <td className="py-3 px-3 text-[11px]">
                            <div className="text-zinc-400">
                              DAY: {s.netStandardHours}h
                            </div>
                            <div className="text-[#39d353]">
                              NGT: {s.netNightHours}h
                            </div>
                          </td>

                          <td className="py-3 px-3 text-zinc-300">
                            {formatYen(s.normalBaseYen + s.nightBaseYen)}
                            <span className="block text-[10px] text-zinc-500">
                              @{s.baseHourlyYen}/h
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            {s.nightPremiumYen > 0 ? (
                              <span className="text-[#39d353] font-semibold">
                                +{formatYen(s.nightPremiumYen)}
                              </span>
                            ) : (
                              <span className="text-zinc-600">¥0</span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-bold text-white text-right">
                            {formatYen(s.totalPayYen)}
                          </td>

                          <td
                            className="py-3 px-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleDeleteShift(s.id)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                              title="Delete Shift Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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