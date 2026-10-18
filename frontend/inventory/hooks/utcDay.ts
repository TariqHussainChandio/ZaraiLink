import { useEffect, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today's UTC date ("YYYY-MM-DD"), the day the API counts reports and filters by. It changes at UTC midnight, so a
 * screen left open overnight asks for the new day instead of keeping yesterday as its "to" (B5 verification). The timer
 * is re-armed for each new day; if the phone sleeps through midnight it fires when the app runs again, and that new
 * render reads the date afresh.
 */
export function useUtcDay(): string {
  const [day, setDay] = useState(utcToday);
  useEffect(() => {
    const now = Date.now();
    const nextMidnight = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
    const timer = setTimeout(() => setDay(utcToday()), nextMidnight - now);
    return () => clearTimeout(timer);
  }, [day]);
  // A render after midnight that came before the timer (a focus, a refresh) already has the new day.
  const current = utcToday();
  return current === day ? day : current;
}
