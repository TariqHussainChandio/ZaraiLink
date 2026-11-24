// Zustand store for the theme choice (light, dark or follow the phone), saved on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

// The saved theme mode and its setter.
export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      mode: 'system',
      setMode: mode => set({ mode }),
    }),
    {
      name: 'zarailink-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
