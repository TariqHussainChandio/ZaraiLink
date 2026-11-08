import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChartColumn, Camera, Clock, Package, Plus, Stethoscope, Tractor, Truck } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ListGroup, ListRow, ListRowIcon, ScreenScaffold, Skeleton } from '../../common/components';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { useFarmerAnalytics } from '../../common/analytics';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../common/constants/routes';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { HomeStackParamList } from '../../navigation/stacks/HomeNavigator';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../state/authStore';
import { RoleScopeProvider, useRoleAccent, useTheme, type Accent, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { formatRs } from '../../utils/money';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The farmer's home (FA-23): the crop-health check first, then what is waiting for the farmer, one way to sell, the
 * numbers, and the places to go. A failed load says so and shows "—", never zeros (FA-14). */
export function FarmerDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabs = useAppTabNavigation();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const query = useFarmerAnalytics(!!userId);
  const { data: stats, isPending, isError, error, refetch, isRefetching } = query;

  // The dashboard summarises what changed elsewhere, so it refreshes every time it comes back into view.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const reload = () => {
    refetch();
  };
  const takePhoto = () => navigateInTab(tabs, APP_TABS.Home, HOME_ROUTES.DiseaseAdvisory);
  const openOrders = () => navigateInTab(tabs, APP_TABS.Orders, ORDERS_ROUTES.OrderHistory);
  const openConsultations = () => navigateInTab(tabs, APP_TABS.Consultations, CONSULTATIONS_ROUTES.ConsultationList);
  const sellProduce = () => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.CreateListing);

  // `stats` is undefined while loading or when the first load failed: figures are then unknown, never 0.
  const needs = stats
    ? [
        { key: 'ready', count: stats.readyToDispatch, icon: Truck, title: plural(stats.readyToDispatch, 'order', 'orders') + ' ready to dispatch', meta: 'Dispatch it from the order', onPress: openOrders },
        { key: 'pending', count: stats.pendingOrders, icon: Clock, title: plural(stats.pendingOrders, 'new order', 'new orders') + ' to confirm', meta: 'Buyers are waiting for your answer', onPress: openOrders },
        { key: 'open', count: stats.openConsultations, icon: Stethoscope, title: plural(stats.openConsultations, 'open consultation', 'open consultations'), meta: 'Check for an expert reply', onPress: openConsultations },
      ].filter(need => need.count > 0)
    : [];

  let situation: string;
  if (isPending) situation = 'Loading your farm';
  else if (!stats) situation = 'Your numbers are not available';
  else if (needs.length > 0) situation = `${plural(needs.length, 'thing needs', 'things need')} you`;
  else situation = "You're up to date";

  return (
    <ScreenScaffold onRefresh={reload} refreshing={isRefetching && !isPending} testID="farmer-dashboard">
      <Text style={styles.situation} accessibilityRole="header">
        {situation}
      </Text>

      {isError ? (
        <Banner tone="danger" title="Couldn't load your numbers" actionLabel="Try again" onAction={reload}>
          {errorMessage(error)}
        </Banner>
      ) : null}

      <RoleScopeProvider scope="ai">
        <ScanCard onTakePhoto={takePhoto} />
      </RoleScopeProvider>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Needs you</Text>
        {isPending ? (
          <Skeleton style={styles.skeleton} />
        ) : !stats ? (
          <Text style={styles.empty}>We could not check what is waiting. Try again.</Text>
        ) : needs.length === 0 ? (
          <Text style={styles.empty}>Nothing is waiting for you.</Text>
        ) : (
          <ListGroup>
            {needs.map(need => (
              <ListRow key={need.key} title={need.title} meta={need.meta} leading={<ListRowIcon icon={need.icon} />} onPress={need.onPress} />
            ))}
          </ListGroup>
        )}
      </View>

      <Button label="Sell produce" variant="secondary" size="lg" icon={Plus} onPress={sellProduce} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your numbers</Text>
        <View style={styles.tiles}>
          <StatTile
            label="Sales"
            value={stats ? formatRs(stats.totalSales) : null}
            note="From completed orders"
            onPress={() => navigation.navigate(HOME_ROUTES.Analytics)}
          />
          <StatTile label="Orders" value={stats ? stats.totalOrders : null} note="Received, any status" onPress={openOrders} />
        </View>
      </View>

      <ListGroup>
        <ListRow
          title="Farms and crops"
          meta={stats ? `${plural(stats.farmCount, 'farm', 'farms')}, ${plural(stats.cropCount, 'crop', 'crops')}` : undefined}
          leading={<ListRowIcon icon={Tractor} />}
          onPress={() => navigation.navigate(HOME_ROUTES.FarmList)}
        />
        <ListRow
          title="My listings"
          meta={stats ? `${stats.activeListings} active` : undefined}
          leading={<ListRowIcon icon={Package} />}
          onPress={() => navigation.navigate(HOME_ROUTES.MyListings)}
        />
        <ListRow title="Analytics" leading={<ListRowIcon icon={ChartColumn} />} onPress={() => navigation.navigate(HOME_ROUTES.Analytics)} />
      </ListGroup>
    </ScreenScaffold>
  );
}

/** "Is a crop sick?": the scan is the farmer's most useful tool, so it is the first thing on the screen, in the AI accent
 * (its result is advice, never a verdict: BR-13). Rendered inside an `ai` role scope, so the tint and the button follow it. */
function ScanCard({ onTakePhoto }: { onTakePhoto: () => void }) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeScanStyles(theme, accent), [theme, accent]);
  return (
    <Card style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        Is a crop sick?
      </Text>
      <Text style={styles.body}>Photograph a leaf for advice</Text>
      <Button label="Take photo" icon={Camera} onPress={onTakePhoto} />
    </Card>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    situation: { ...typography.display, color: colors.ink },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
    empty: { ...typography.body, color: colors.ink2 },
    skeleton: { width: '100%', height: space[12] },
    tiles: { flexDirection: 'row', gap: space[3] },
  });
}

function makeScanStyles({ space, typography, colors, borders }: Theme, accent: Accent) {
  return StyleSheet.create({
    card: { gap: space[3], backgroundColor: accent.soft, borderColor: accent.mark, borderWidth: borders.hairline },
    title: { ...typography.titleLg, color: accent.ink },
    body: { ...typography.bodyLg, color: colors.ink },
  });
}
