import { ShoppingBag, Sprout, Stethoscope, Store, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ListGroup, ListRow } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { AuthScreen } from '../components/AuthScreen';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';
import { useTheme, type Theme } from '../../../theme';
import type { RegistrableRole } from '../../constants/roles';

// SRDS §4: four ways to register, one per public role; there is no public path to admin (§50).
const CHOICES: { role: RegistrableRole; title: string; meta: string; icon: LucideIcon }[] = [
  { role: 'farmer', title: 'Farmer', meta: 'Sell your produce, look after your farms, check a sick crop', icon: Sprout },
  { role: 'buyer', title: 'Buyer', meta: 'Buy produce and farm inputs', icon: ShoppingBag },
  { role: 'dealer', title: 'Dealer', meta: 'Sell agricultural inputs. Reviewed by an administrator', icon: Store },
  { role: 'expert', title: 'Agricultural expert', meta: 'Advise farmers. Reviewed by an administrator', icon: Stethoscope },
];

export function CreateAccountScreen({ navigation }: AuthScreenProps<typeof AUTH_ROUTES.CreateAccount>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <AuthScreen title="Create your account" subtitle="How will you use ZaraiLink?">
      <ListGroup>
        {CHOICES.map(choice => {
          const Icon = choice.icon;
          return (
            <ListRow
              key={choice.role}
              title={choice.title}
              meta={choice.meta}
              leading={<Icon color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />}
              onPress={() => navigation.navigate(AUTH_ROUTES.Register, { role: choice.role })}
            />
          );
        })}
      </ListGroup>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Button label="Sign in" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.Login)} />
      </View>
    </AuthScreen>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space[1] },
    footerText: { ...typography.body, color: colors.ink2 },
  });
}
