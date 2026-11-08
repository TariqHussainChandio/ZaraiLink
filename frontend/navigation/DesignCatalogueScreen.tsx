import { Ban, Package, ShoppingBag, Sprout, Truck, Wallet } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  CodeField,
  ConfirmSheet,
  EmptyState,
  ListGroup,
  ListRow,
  ListRowIcon,
  LocationPicker,
  OrderTimeline,
  PhoneInput,
  PhotoViewer,
  PriceBreakdown,
  QuantityStepper,
  QueryState,
  RatePlate,
  RoleBadge,
  ScreenScaffold,
  SelectField,
  Sheet,
  SkeletonListItem,
  Snackbar,
  StatusBadge,
  StickyActionBar,
  TextField,
  TopAppBar,
  useSnackbar,
} from '../common/components';
import { BarChart } from '../common/components/dashboards/BarChart';
import { StatTile } from '../common/components/dashboards/StatTile';
import { STATUS } from '../common/constants/status';
import { type AccentKey, RoleScopeProvider, type Theme, useTheme } from '../theme';

// The design catalogue (A2's exit evidence, rebuilt for D15, Rate Board): every shared component in the current theme and
// role accent, on one screen. Registered only in development builds (ProfileNavigator, behind __DEV__); switch light and
// dark in Settings, the accent with the chips.
const SCOPES: { value: AccentKey; label: string }[] = [
  { value: 'brand', label: 'Brand' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'expert', label: 'Expert' },
  { value: 'admin', label: 'Admin' },
  { value: 'ai', label: 'Advisory' },
];

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// A small generated checkerboard, so the photo viewer has something to zoom without shipping an image file.
const SAMPLE_PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAbElEQVR42u3XoQ0AIAxFQcZGMw6TYBiCTVigqBoIlyArOPXyS+0tfGPN8N12XwAAAAAAUoBXPnq6BwAAAADIAZQYAAAAwB5QYgAAAAB7QIkBAAAA7AElBgAAALAHlBgAAADAHlBiAAAAgG8AGxz40eFaME48AAAAAElFTkSuQmCC';
const PHOTOS = [
  { uri: SAMPLE_PHOTO, label: 'Sample photo 1' },
  { uri: SAMPLE_PHOTO, label: 'Sample photo 2' },
  { uri: SAMPLE_PHOTO, label: 'Sample photo 3' },
];

const IDLE = { isPending: false, isError: false, error: null, fetchStatus: 'idle' as const, data: [1], refetch: () => undefined };
const LOADING = { ...IDLE, isPending: true, data: undefined, fetchStatus: 'fetching' as const };
const PAUSED = { ...LOADING, fetchStatus: 'paused' as const };
const FAILED = { ...IDLE, isError: true, data: undefined, error: new Error('Storage upload failed') };

export function DesignCatalogueScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const [scope, setScope] = useState<AccentKey>('brand');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [chip, setChip] = useState('seed');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [province, setProvince] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>('bag');
  const [quantity, setQuantity] = useState(3);

  return (
    <RoleScopeProvider scope={scope}>
      <ScreenScaffold>
        <ChipRow options={SCOPES} value={scope} onChange={setScope} />

        <Section title="Type" styles={styles}>
          {(Object.keys(theme.typography) as (keyof Theme['typography'])[]).map(key => (
            <Text key={key} style={[theme.typography[key], { color: theme.colors.ink }]}>
              {key} · Rs 12,450
            </Text>
          ))}
        </Section>

        <Section title="Rate plates" styles={styles}>
          <RatePlate amount={4250} unit="per 40 kg" size="xl" />
          <View style={styles.row}>
            <RatePlate amount={12500} unit="per 50 kg bag" size="lg" />
            <RatePlate amount={3980} unit="per litre" size="md" />
          </View>
        </Section>

        <Section title="Buttons" styles={styles}>
          <Button label="Place order" size="lg" icon={ShoppingBag} />
          <View style={styles.row}>
            <Button label="Save" variant="secondary" fullWidth={false} />
            <Button label="Cancel" variant="quiet" fullWidth={false} />
            <Button label="Delete" variant="danger" fullWidth={false} />
            <Button label="Cancel this order" variant="dangerQuiet" icon={Ban} fullWidth={false} />
          </View>
          <View style={styles.row}>
            <Button label="Placing order" loading fullWidth={false} />
            <Button label="Approve" size="sm" fullWidth={false} />
            <Button label="Disabled" disabled fullWidth={false} />
          </View>
        </Section>

        <Section title="Fields" styles={styles}>
          <TextField label="Price" prefix="Rs" suffix="per 40 kg maund" defaultValue="4200" numeric keyboardType="numeric" />
          <TextField label="Quantity" defaultValue="0" numeric error="Enter at least 1 maund, or mark the listing as sold" />
          <TextField label="Village or town" optional placeholder="For example, Chak 45 SB" helper="Buyers see the district only" />
          <TextField label="Registration number" defaultValue="PB-SGD-0421" editable={false} />
          <TextField label="Password" secureTextEntry autoComplete="new-password" textContentType="newPassword" defaultValue="secret123" />
          <PhoneInput value={phone} onChange={setPhone} />
          <Text style={styles.meta}>{phone ? `Stored as ${phone}` : 'Type 0300 1234567, +92 300 1234567 or 923001234567'}</Text>
          <CodeField value={code} onChange={setCode} label="Code from your email" />
          <SelectField label="Unit" value={unit} onSelect={setUnit} searchable={false} options={[{ id: 'bag', label: 'Bag' }, { id: 'kg', label: 'Kilogram' }, { id: 'maund', label: 'Maund (40 kg)' }]} />
          <LocationPicker country="Pakistan" province={province} city={city} onProvinceChange={setProvince} onCityChange={setCity} errors={{ city: province ? undefined : 'Enter the city' }} />
        </Section>

        <Section title="Quantity" styles={styles}>
          <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={340} unit="bag" />
          <QuantityStepper value={500} onChange={setQuantity} min={1} max={340} unit="bag" />
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
            {(Object.keys(STATUS.document) as (keyof typeof STATUS.document)[]).map(s => (
              <StatusBadge key={s} kind="document" status={s} />
            ))}
            {(Object.keys(STATUS.storeSupplier) as (keyof typeof STATUS.storeSupplier)[]).map(s => (
              <StatusBadge key={s} kind="storeSupplier" status={s} />
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
          <Card onPress={() => undefined} accessibilityLabel="Galaxy-2013 wheat seed, Chaudhry Seeds, Sargodha">
            <Text style={styles.strong}>Galaxy-2013 wheat seed</Text>
            <Text style={styles.meta}>Chaudhry Seeds · Sargodha</Text>
          </Card>
          <Card selected pad="sm">
            <Text style={styles.strong}>Cash on delivery</Text>
            <Text style={styles.meta}>Pay the seller when the order arrives</Text>
          </Card>
          <ListGroup>
            <ListRow
              title="Sona Urea, 50 kg bag × 20"
              meta="Nadia Batool, Okara · 12 Nov"
              leading={<ListRowIcon icon={Package} />}
              status={<StatusBadge kind="order" status="ready" size="sm" />}
              trailing={<Text style={styles.price}>Rs 95,800</Text>}
              onPress={() => undefined}
            />
            <ListRow title="Nadia Batool" meta="Basmati rice, 12 maunds" leading={<Avatar name="Nadia Batool" role="buyer" />} />
            <SkeletonListItem />
          </ListGroup>
        </Section>

        <Section title="Banners and feedback" styles={styles}>
          <Banner tone="advisory" title="This is a likely match, not a diagnosis" actionLabel="Talk to an expert" onAction={() => undefined}>
            The photo looks most like leaf rust. Ask a verified expert before you spray.
          </Banner>
          <Banner tone="warning" title="Your application is under review">
            Decisions usually take 2 working days.
          </Banner>
          <Banner tone="danger" title="Payment failed" actionLabel="Try again" onAction={() => undefined}>
            The seller has not confirmed this payment. Message them, or choose another way to pay.
          </Banner>
          <Banner tone="success" title="Order placed" />
          <Banner tone="info" title="Prices are per 40 kg maund" />
          <Banner tone="offline" title="No connection" />
          <Snackbar message="Listing published" action={{ label: 'View', onPress: () => undefined }} />
          <View style={styles.row}>
            <Button label="Show a snackbar" variant="secondary" fullWidth={false} onPress={() => snackbar.show('Removed from the cart', { label: 'Undo', onPress: () => undefined })} />
            <Button label="Open photos" variant="secondary" fullWidth={false} onPress={() => setPhotosOpen(true)} />
          </View>
        </Section>

        <Section title="Loading, failed, waiting, empty" styles={styles}>
          <QueryState query={LOADING}>
            <Text>Loaded</Text>
          </QueryState>
          <QueryState query={FAILED} failureTitle="Couldn't load your orders">
            <Text>Loaded</Text>
          </QueryState>
          <QueryState query={PAUSED}>
            <Text>Loaded</Text>
          </QueryState>
          <QueryState query={IDLE} isEmpty empty={{ title: 'No listings yet', description: 'Your listings appear here once you publish one.', actionLabel: 'New listing', onAction: () => undefined }}>
            <Text>Loaded</Text>
          </QueryState>
        </Section>

        <Section title="Money and orders" styles={styles}>
          <Card>
            <PriceBreakdown itemsLabel="Products (3 bags of urea)" subtotal={14250} delivery={800} payTo="Pay the seller directly, in cash on delivery" />
          </Card>
          <Card>
            <OrderTimeline status="ready" reachedAt={{ pending: '26 Sep, 10:05 am', confirmed: '26 Sep, 11:20 am', processing: '26 Sep, 2:00 pm', ready: '27 Sep, 9:15 am' }} />
          </Card>
          <Card>
            <OrderTimeline status="rejected" reachedAt={{ pending: '26 Sep, 10:05 am', rejected: '26 Sep, 6:30 pm' }} />
          </Card>
          <View style={styles.row}>
            <StatTile label="Stock units" value={3482} unit="units" icon={Truck} />
            <StatTile label="Inventory value" value="Rs 2,184,300" icon={Wallet} />
          </View>
          <View style={styles.row}>
            <StatTile label="Orders to dispatch" value={3} tone="warning" onPress={() => undefined} />
            <StatTile label="Revenue this month" value={null} note="Could not be loaded" />
          </View>
          <BarChart
            data={[
              { label: 'Aug', value: 12 },
              { label: 'Sep', value: 18 },
              { label: 'Oct', value: 9 },
              { label: 'Nov', value: 0 },
            ]}
          />
        </Section>

        <Section title="App bars" styles={styles}>
          {/* Drawn mid-page here, so without the status-bar inset an app bar has at the top of a screen. */}
          <SafeAreaInsetsContext.Provider value={NO_INSETS}>
            <TopAppBar title="Good morning, Aslam" subtitle="Multan · 3 orders need you" variant="large" />
            <TopAppBar title="Order ZL-24817" onBack={() => undefined} />
            <TopAppBar title="Stock" variant="inventory" onBack={() => undefined} />
          </SafeAreaInsetsContext.Provider>
        </Section>

        <Section title="Sheets and action bar" styles={styles}>
          <Card pad="none">
            <EmptyState icon={Sprout} title="No listings yet" description="List what you have to sell; buyers nearby will see it." actionLabel="New listing" onAction={() => undefined} />
          </Card>
          <View style={styles.row}>
            <Button label="Open a sheet" variant="secondary" fullWidth={false} onPress={() => setSheetOpen(true)} />
            <Button label="Open a confirm sheet" variant="secondary" fullWidth={false} onPress={() => setConfirmOpen(true)} />
          </View>
          <Card pad="none">
            <StickyActionBar leading={<RatePlate amount={14250} unit="Total with delivery" size="md" />}>
              <Button label="Place order" size="lg" />
            </StickyActionBar>
          </Card>
        </Section>
      </ScreenScaffold>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Adjust stock"
        footer={<Button label="Save adjustment" size="lg" onPress={() => setSheetOpen(false)} />}
      >
        <TextField label="Bags" defaultValue="4" numeric keyboardType="numeric" />
      </Sheet>
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reject this order?"
        message="Nadia Batool is told it was rejected."
        confirmLabel="Reject order"
        keepLabel="Keep the order"
        destructive
        reason={{ label: 'Reason for rejecting', chips: ['Out of stock', 'Price changed'], minLength: 5, helper: 'Nadia Batool sees this' }}
        onConfirm={() => snackbar.show('Order rejected')}
      />
      <PhotoViewer visible={photosOpen} onClose={() => setPhotosOpen(false)} photos={PHOTOS} />
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
    section: { gap: space[3] },
    sectionTitle: { ...typography.title, color: colors.ink },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
    strong: { ...typography.bodyStrong, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    price: { ...typography.price, color: colors.ink },
  });
}
