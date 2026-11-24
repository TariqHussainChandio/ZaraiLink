// Hook that sets light or dark status bar icons when a screen gains focus.
import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect } from 'react';
import { StatusBar, type StatusBarStyle } from 'react-native';

/**
 * Sets the status bar's icons whenever the screen this runs in comes into focus. D20 made every app bar olive (light
 * icons), while the sign-in pages are the light field (dark icons in the light theme). A `<StatusBar>` element is not
 * enough: tabs keep their screens mounted, and the element mounted last wins whichever tab is in front, so the guest's
 * Market came back with dark icons on olive after a visit to sign-in. Outside a navigator (the splash, a test) it simply
 * applies once.
 */
export function useStatusBarStyle(style: StatusBarStyle): void {
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    // Applies the requested status bar style.
    const apply = () => StatusBar.setBarStyle(style, true);
    if (!navigation) {
      apply();
      return undefined;
    }
    if (navigation.isFocused()) apply();
    return navigation.addListener('focus', apply);
  }, [navigation, style]);
}
