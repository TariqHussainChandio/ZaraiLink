import { Flag, List, Receipt, Store, Tags, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ListGroup, ListRow, ListRowIcon } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';

const DESTINATIONS = [
  { route: ADMIN_HOME_ROUTES.UserManagement, icon: Users, title: 'Users', meta: 'Suspend accounts and change roles' },
  { route: ADMIN_HOME_ROUTES.ListingModeration, icon: Store, title: 'Listings', meta: 'Hide or restore marketplace listings' },
  { route: ADMIN_HOME_ROUTES.Reports, icon: Flag, title: 'Reports', meta: 'What buyers and sellers have reported' },
  { route: ADMIN_HOME_ROUTES.Orders, icon: Receipt, title: 'Orders', meta: 'Every order on the platform' },
  { route: ADMIN_HOME_ROUTES.Categories, icon: Tags, title: 'Categories', meta: 'Marketplace categories' },
  { route: ADMIN_HOME_ROUTES.ReferenceData, icon: List, title: 'Reference data', meta: 'Units, currencies and other lists' },
] as const;

/** The admin's Moderation tab: every moderation screen, one row each. */
export function ModerationScreen({ navigation }: AdminScreenProps<'ModerationHub'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ListGroup>
        {DESTINATIONS.map(d => (
          <ListRow key={d.route} title={d.title} meta={d.meta} leading={<ListRowIcon icon={d.icon} />} onPress={() => navigation.navigate(d.route)} />
        ))}
      </ListGroup>
    </ScrollView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4] },
  });
}
