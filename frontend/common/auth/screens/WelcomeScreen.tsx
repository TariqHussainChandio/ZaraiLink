import { CircleUserRound } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components';
import { APP_TABS, AUTH_ROUTES } from '../../constants/routes';
import { AuthScreen } from '../components/AuthScreen';
import { useTheme, type Theme } from '../../../theme';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

/** Where a guest's profile button leads (D20): the profile mark, then Sign up and Log in. Browsing needs neither (D18),
 * so Back returns to the market. */
export function WelcomeScreen({ navigation }: AuthScreenProps<'Welcome'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <AuthScreen
      brand
      title="Your ZaraiLink account"
      subtitle="Sign up to buy, sell and talk to sellers, or log in if you already have an account."
      onBack={() => navigation.getParent()?.navigate(APP_TABS.Marketplace)}
    >
      <View style={styles.mark} accessible={false} importantForAccessibility="no-hide-descendants">
        <CircleUserRound color={theme.colors.accent.brand.mark} size={theme.size.avatarLg} strokeWidth={theme.size.iconStroke} />
      </View>
      <View style={styles.actions}>
        <Button label="Sign up" size="lg" onPress={() => navigation.navigate(AUTH_ROUTES.CreateAccount)} />
        <Button label="Log in" variant="secondary" size="lg" onPress={() => navigation.navigate(AUTH_ROUTES.Login)} />
      </View>
    </AuthScreen>
  );
}

function makeStyles({ colors, space, size, radius }: Theme) {
  return StyleSheet.create({
    // The profile mark on a soft olive disc, the picture of "your account".
    mark: {
      alignSelf: 'center',
      width: size.avatarLg + space[8],
      height: size.avatarLg + space[8],
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent.brand.soft,
    },
    actions: { gap: space[3] },
  });
}
