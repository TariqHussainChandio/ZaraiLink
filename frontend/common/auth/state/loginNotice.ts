import { create } from 'zustand';

/** A message the sign-in screen shows once, left by the screen that sent the person there: the account was deleted, or an
 * approved dealer or expert is signing in again. Signing out swaps the whole navigator, so a route parameter cannot carry
 * it across; this small store does. It is memory only (a restart shows a plain sign-in) and holds no secret. */
interface LoginNotice {
  tone: 'success' | 'info';
  title: string;
  message?: string;
  /** Filled into the email field. */
  email?: string;
}

interface LoginNoticeState {
  notice: LoginNotice | null;
  leave: (notice: LoginNotice) => void;
  clear: () => void;
}

export const useLoginNotice = create<LoginNoticeState>(set => ({
  notice: null,
  leave: notice => set({ notice }),
  clear: () => set({ notice: null }),
}));
