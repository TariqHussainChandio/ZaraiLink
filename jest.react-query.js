// React Query schedules a clean-up timer (gcTime) whenever a query or mutation loses its last observer, for example
// when a test unmounts a screen. Hooks that set their own gcTime (30 minutes for consultations and messages) leave
// those timers running after the test. When every test file runs in one process, as on CI's two-core runners, they
// keep Node from exiting and the job times out. Tests never wait for this clean-up, so the timers are unref'd: they
// still fire while the process is alive, but they never hold it open. The app itself is unchanged.
const { timeoutManager } = require('@tanstack/react-query');

const unref = timer => {
  timer?.unref?.();
  return timer;
};

timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => unref(setTimeout(callback, delay)),
  clearTimeout: timer => clearTimeout(timer),
  setInterval: (callback, delay) => unref(setInterval(callback, delay)),
  clearInterval: timer => clearInterval(timer),
});
