import { useCallback, useEffect, useState } from 'react';

/** Supabase sends at most one email per 60 seconds (supabase/config.toml, `max_frequency`), so a resend sooner than that is
 * refused. The countdown keeps the button honest instead of letting a person tap into an error. */
const RESEND_COOLDOWN_SECONDS = 60;

/** "0:42" for the countdown text. */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A countdown to when a new code may be asked for. It starts running when the screen opens (the code was just sent) and
 * again on `restart()`. The end time is kept, not a counter, so a timer the phone delays in the background cannot make it
 * lag behind the clock. */
export function useResendCooldown(seconds: number = RESEND_COOLDOWN_SECONDS) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + seconds * 1000);
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const restart = useCallback(() => setEndsAt(Date.now() + seconds * 1000), [seconds]);
  return { remaining, restart };
}
