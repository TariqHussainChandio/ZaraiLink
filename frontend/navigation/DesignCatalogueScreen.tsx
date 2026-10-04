import { Package, ShoppingBag, Sprout, Truck, Wallet } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  ListGroup,
  ListRow,
  ListRowIcon,
  OrderTimeline,
  PriceBreakdown,
  RoleBadge,
  Sheet,
  SkeletonListItem,
  StatusBadge,
  TextField,
  TopAppBar,
} from '../common/components';
import { StatTile } from '../common/components/dashboards/StatTile';
import { STATUS } from '../common/constants/status';
import { type AccentKey, RoleScopeProvider, type Theme, useTheme } from '../theme';

// A2's exit evidence: every shared component in the current theme and role accent, on one screen. Registered only in
// development builds (ProfileNavigator, behind __DEV__); switch light and dark in Settings, the accent with the chips.
const SCOPES: { value: AccentKey; label: string }[] = [
  { value: 'brand', label: 'Market' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'expert', label: 'Expert' },
  { value: 'admin', label: 'Admin' },
  { value: 'ai', label: 'Advisory' },
];

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export function DesignCatalogueScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [scope, setScope] = useState<AccentKey>('brand');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chip, setChip] = useState('seed');

  return (
    <RoleScopeProvider scope={scope}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <ChipRow options={SCOPES} value={scope} onChange={setScope} />

        <Section title="Type" styles={styles}>
          {(Object.keys(theme.typography) as (keyof Theme['typography'])[]).map(key => (
            <Text key={key} style={[theme.typography[key], { color: theme.colors.ink }]}>
              {key} · Rs 12,450
            </Text>
          ))}
        </Section>

        <Section title="Buttons" styles={styles}>
          <Button label="Place order" size="lg" icon={ShoppingBag} />
          <View style={styles.row}>
            <Button label="Save" variant="secondary" fullWidth={false} />
            <Button label="Cancel" variant="quiet" fullWidth={false} />
            <Button label="Delete" variant="danger" fullWidth={false} />
          </View>
          <View style={styles.row}>
            <Button label="Placing order" loading fullWidth={false} />
            <Button label="Approve" size="sm" fullWidth={false} />
            <Button label="Disabled" disabled fullWidth={false} />
          </View>
        </Section>

        <Section title="Text fields" styles={styles}>
          <TextField label="Price" prefix="Rs" suffix="per 40 kg maund" defaultValue="4200" numeric keyboardType="numeric" />
          <TextField label="Quantity" defaultValue="0" numeric error="Enter at least 1 maund, or mark the listing as sold" />
          <TextField label="Village or town" optional placeholder="For example, Chak 45 SB" helper="Buyers see the district only" />
          <TextField label="Registration number" defaultValue="PB-SGD-0421" editable={false} />
        </Section>

        <Section title="Chips and badges" styles={styles}>
          <View style={styles.row}>
            <Chip label="Seed" selected={chip === 'seed'} onPress={() => setChip('seed')} count={46} />
            <Chip label="Fertiliser" selected={chip === 'fert'} onPress={() => setChip('fert')} count={73} />
            <Chip label="Machinery" disabled onPress={() => undefined} />
          </View>
          <View style={styles.row}>
            {(Object.keys(STATUS.order) as (keyof typeof STATUS.order)[]).map(s => (
              <StatusBadge key={s} kind="order" status={s} />
            ))}
          </View>
          <View style={styles.row}>
            {(Object.keys(STATUS.stock) as (keyof typeof STATUS.stock)[]).map(s => (
              <StatusBadge key={s} kind="stock" status={s} />
            ))}
            <Badge label="Plant diseases" />
          </View>
          <View style={styles.row}>
            <RoleBadge role="farmer" />
            <RoleBadge role="buyer" />
            <RoleBadge role="dealer" />
            <RoleBadge role="expert" />
            <RoleBadge role="admin" />
          </View>
          <View style={styles.row}>
            <Avatar name="Muhammad Aslam" role="farmer" size={theme.size.avatarLg} ring />
            <Avatar name="Nadia Batool" role="buyer" />
            <Avatar name="Imran Haider" role="expert" size={theme.size.avatarSm} />
          </View>
        </Section>

        <Section title="Cards and rows" styles={styles}>
          <Card onPress={() => undefined}>
            <Text style={styles.strong}>Galaxy-2013 wheat seed</Text>
            <Text style={styles.meta}>Chaudhry Seeds · Sargodha</Text>
          </Card>
          <Card selected pad="sm">
            <Text style={styles.strong}>Cash on delivery</Text>
            <Text style={styles.meta}>Pay the seller when the order arrives</Text>
          </Card>
          <ListGroup>
            <ListRow
              title="Urea, 50 kg bag"
              meta="Order ZL-24817 · 3 bags"
              leading={<ListRowIcon icon={Package} />}
              trailing={<StatusBadge kind="order" status="ready" size="sm" />}
              onPress={() => undefined}
            />
            <ListRow title="Nadia Batool" meta="Basmati rice, 12 maunds" leading={<Avatar name="Nadia Batool" role="buyer" />} />
            <SkeletonListItem />
          </ListGroup>
        </Section>

        <Section title="Banners" styles={styles}>
          <Banner tone="advisory" title="This is a likely match, not a diagnosis" actionLabel="Talk to an expert" onAction={() => undefined}>
            The photo looks most like leaf rust. Ask a verified expert before you spray.
          </Banner>
          <Banner tone="warning" title="Your application is under review">
            We usually decide within 2 working days.
          </Banner>
          <Banner tone="danger" title="Payment failed" actionLabel="Try again" onAction={() => undefined}>
            The bank transfer could not be confirmed.
          </Banner>
          <Banner tone="success" title="Order placed" />
          <Banner tone="info" title="Prices are per 40 kg maund" />
          <Banner tone="offline" title="You are offline" />
        </Section>

        <Section title="Money and orders" styles={styles}>
          <Card>
            <PriceBreakdown itemsLabel="Products (3 bags of urea)" subtotal={14250} delivery={800} payTo="Pay the seller directly, in cash on delivery" />
          </Card>
          <Card>
            <OrderTimeline status="ready" reachedAt={{ pending: '26 Sept, 10:05 am', confirmed: '26 Sept, 11:20 am', processing: '26 Sept, 2:00 pm', ready: '27 Sept, 9:15 am' }} />
          </Card>
          <Card>
            <OrderTimeline status="rejected" reachedAt={{ pending: '26 Sept, 10:05 am', rejected: '26 Sept, 6:30 pm' }} />
          </Card>
          <View style={styles.row}>
            <StatTile label="Stock units" value={3482} unit="units" icon={Truck} />
            <StatTile label="Inventory value" value="Rs 2,184,300" icon={Wallet} />
          </View>
        </Section>

        <Section title="App bars" styles={styles}>
          {/* Drawn mid-page here, so without the status-bar inset an app bar has at the top of a screen. */}
          <SafeAreaInsetsContext.Provider value={NO_INSETS}>
            <TopAppBar title="Good morning, Aslam" subtitle="Multan · 3 orders need you" variant="large" />
            <TopAppBar title="Order ZL-24817" onBack={() => undefined} />
            <TopAppBar title="Stock" variant="inventory" onBack={() => undefined} />
          </SafeAreaInsetsContext.Provider>
        </Section>

        <Section title="Empty state and sheet" styles={styles}>
          <Card pad="none">
            <EmptyState icon={Sprout} title="No listings yet" description="List what you have to sell; buyers nearby will see it." actionLabel="New listing" onAction={() => undefined} />
          </Card>
          <Button label="Open a sheet" variant="secondary" onPress={() => setSheetOpen(true)} />
          <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Adjust stock">
            <TextField label="Bags" defaultValue="4" numeric keyboardType="numeric" />
            <Button label="Save adjustment" size="lg" onPress={() => setSheetOpen(false)} />
          </Sheet>
        </Section>
      </ScrollView>
    </RoleScopeProvider>
  );
}

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[6] },
    section: { gap: space[3] },
    sectionTitle: { ...typography.title, color: colors.ink },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
    strong: { ...typography.bodyStrong, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
  });
}
