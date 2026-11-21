import { NavigationContext } from '@react-navigation/native';
import { useContext, useLayoutEffect } from 'react';
import { useAuthStore } from '../state/authStore';

/**
 * D20: a dashboard's large app bar carries the signed-in person's name instead of "Overview" or "Dashboard", so the
 * first thing read (and the heading TalkBack lands on) says whose account this is. Without a name yet (the profile not
 * read, offline) the stack's own title stays. The farmer's home greets by name instead (useGreetingTitle). Outside a
 * navigator (a screen rendered on its own in a test) there is no app bar, and it does nothing.
 */
export function useNameTitle(): void {
  const navigation = useContext(NavigationContext);
  const fullName = useAuthStore(state => state.profile?.full_name?.trim());
  useLayoutEffect(() => {
    if (fullName) navigation?.setOptions({ title: fullName });
  }, [navigation, fullName]);
}
