import { useNavigation } from '@react-navigation/native';
import { useLayoutEffect } from 'react';
import { useAuthStore } from '../../state/authStore';

/** "Good morning, Ali" by the hour of the day; without a name (offline, the profile not read yet) only the greeting. */
export function greetingFor(fullName: string | null | undefined, now: Date = new Date()): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = fullName?.trim();
  return name ? `${part}, ${name}` : part;
}

/**
 * Puts the greeting in the dashboard's large app bar, where the design system draws it ("Good morning, Aslam" in the
 * design catalogue). The large app bar reads its title as a heading, so a screen-reader user landing on Home hears
 * whose dashboard this is first (A8, F1), instead of a bare "Home". Set from the screen because the stack's static
 * title cannot know the user's name.
 */
export function useGreetingTitle() {
  const navigation = useNavigation();
  const fullName = useAuthStore(state => state.profile?.full_name);
  const title = greetingFor(fullName);
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);
}
