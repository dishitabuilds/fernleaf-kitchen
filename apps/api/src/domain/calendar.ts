import { ApiError } from '../common/api-error';

export const KITCHEN_TIMEZONE = 'Asia/Kolkata';
export interface Calendar { workingDays: number[]; holidays: string[] }

export function assertCalendarDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2000-01-01' || date > '9999-12-31') throw new ApiError(400, 'DATE_INVALID', 'Use a valid calendar date in YYYY-MM-DD format, year 2000 or later.');
  const instant = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) throw new ApiError(400, 'DATE_INVALID', 'This calendar date does not exist.');
}
export function assertLocalTime(time: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(400, 'TIME_INVALID', 'Use a valid 24-hour time in HH:mm format.');
}
export function assertCalendar(calendar: Calendar): void {
  if (!calendar.workingDays.length || calendar.workingDays.length > 7 || calendar.workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(calendar.workingDays).size !== calendar.workingDays.length) throw new ApiError(400, 'CALENDAR_INVALID', 'Choose unique working days with at least one open day.');
  if (calendar.holidays.length > 366 || new Set(calendar.holidays).size !== calendar.holidays.length) throw new ApiError(400, 'CALENDAR_INVALID', 'Holiday dates must be unique, with at most 366 entries.');
  calendar.holidays.forEach(assertCalendarDate);
}
export function isDeliveryDateAllowed(date: string, calendar: Calendar): boolean {
  assertCalendarDate(date); assertCalendar(calendar);
  return calendar.workingDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !calendar.holidays.includes(date);
}
export function calculateCutoff(deliveryDate: string, kitchenCalendar: Calendar, cutoffWorkingDays: number, cutoffTime: string): Date {
  assertCalendarDate(deliveryDate); assertCalendar(kitchenCalendar); assertLocalTime(cutoffTime);
  if (!Number.isInteger(cutoffWorkingDays) || cutoffWorkingDays < 0 || cutoffWorkingDays > 30) throw new ApiError(400, 'CUTOFF_DAYS_INVALID', 'Cutoff working days must be a whole number from 0 to 30.');
  const cursor = new Date(`${deliveryDate}T00:00:00.000Z`);
  let remaining = cutoffWorkingDays;
  // Finite calendar data and a nonempty working week ensure this terminates.
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const date = cursor.toISOString().slice(0, 10);
    if (kitchenCalendar.workingDays.includes(cursor.getUTCDay()) && !kitchenCalendar.holidays.includes(date)) remaining--;
  }
  return new Date(`${cursor.toISOString().slice(0, 10)}T${cutoffTime}:00+05:30`);
}
export function kitchenDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: KITCHEN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((name) => parts.find((part) => part.type === name)!.value).join('-');
}
export function deadlinePassed(now: Date, cutoff: Date): boolean { return now.getTime() >= cutoff.getTime(); }
