import { ShiftInput, ShiftRepository, WageRules } from '@/types/shift';
import { DEFAULT_WAGE_RULES } from './shiftCalculator';

const SHIFTS_STORAGE_KEY = 'jp_visa_tracker_shifts_v1';
const RULES_STORAGE_KEY = 'jp_visa_tracker_rules_v1';

const DEMO_SHIFTS: ShiftInput[] = [
  {
    id: 'seed-1',
    date: '2026-10-21',
    startTime: '21:30',
    endTime: '06:30',
    breakMinutes: 60,
    baseHourlyYen: 1300,
    note: 'Fulfillment Center (Night Shift)',
  },
  {
    id: 'seed-2',
    date: '2026-10-23',
    startTime: '18:00',
    endTime: '23:30',
    breakMinutes: 30,
    baseHourlyYen: 1180,
    note: 'Konbini Evening Shift',
  },
  {
    id: 'seed-3',
    date: '2026-10-25',
    startTime: '22:00',
    endTime: '05:00',
    breakMinutes: 45,
    baseHourlyYen: 1300,
    note: 'Late Night Sorting',
  },
];

export const localShiftRepository: ShiftRepository = {
  getAll(): ShiftInput[] {
    if (typeof window === 'undefined') return DEMO_SHIFTS;
    const raw = window.localStorage.getItem(SHIFTS_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(SHIFTS_STORAGE_KEY, JSON.stringify(DEMO_SHIFTS));
      return DEMO_SHIFTS;
    }
    try {
      return JSON.parse(raw) as ShiftInput[];
    } catch {
      return DEMO_SHIFTS;
    }
  },

  save(shift: ShiftInput): ShiftInput[] {
    const current = this.getAll();
    const updated = [shift, ...current.filter((s) => s.id !== shift.id)].sort(
      (a, b) => b.date.localeCompare(a.date)
    );
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHIFTS_STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  },

  remove(id: string): ShiftInput[] {
    const updated = this.getAll().filter((s) => s.id !== id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHIFTS_STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  },

  clearAll(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHIFTS_STORAGE_KEY, JSON.stringify([]));
    }
  },

  getRules(): WageRules {
    if (typeof window === 'undefined') return DEFAULT_WAGE_RULES;
    const raw = window.localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_WAGE_RULES;
    try {
      return { ...DEFAULT_WAGE_RULES, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_WAGE_RULES;
    }
  },

  saveRules(rules: WageRules): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
    }
  },
};