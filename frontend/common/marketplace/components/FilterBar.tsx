import { SlidersHorizontal, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button, Dropdown, IconButton, SelectField, TextField, type AnchorRect, type SelectOption } from '../../components';
import { useInsets } from '../../../hooks/useInsets';
import { useCategories, useListingFilterOptions } from '../hooks/marketplace';
import { useTheme, type Theme } from '../../../theme';
import { formatRs } from '../../../utils/money';
import { digitsOnly, parseWhole } from '../utils/digits';

/** How long typing must pause before the feed is asked again: one request per word, not one per letter (MK-13). */
const SEARCH_DEBOUNCE_MS = 400;

/** The dropdowns' "no choice" options; SelectField needs a string id for them. */
const ALL_CATEGORIES = 'all';
const ALL_CITIES = '__all_cities__';

interface MoreFilters {
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  categoryId: string | null;
}

export interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  categoryId: string | null;
  onApplyMoreFilters: (filters: MoreFilters) => void;
}

/** The market's search box, the filters, and a removable chip for each filter in force. The market shows every listing
 * until it is searched or filtered (D20: no category chips). The filters open as a panel directly under the filter icon
 * (D20, instead of a sheet from the bottom of the screen) and ask for exactly what the API can filter by: price range,
 * city and category (D20: the crop chips gave way to a category dropdown). Every choice comes from the platform as it is
 * now: the categories, the cities that have listings for sale, and the lowest and highest price on the market. */
export function FilterBar({
  search,
  onSearchChange,
  minPrice,
  maxPrice,
  city,
  categoryId,
  onApplyMoreFilters,
}: FilterBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Where the panel opens: under the search row, its right edge under the filter icon.
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [text, setText] = useState(search);
  const [draftMin, setDraftMin] = useState('');
  const [draftMax, setDraftMax] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftCategory, setDraftCategory] = useState<string | null>(null);
  const window = useWindowDimensions();
  const insets = useInsets();
  // The categories the platform lists now, from the database, never a list kept in the app: one an admin adds appears
  // here the next time the filters open (they are asked for again then, see openSheet).
  const { data: categories = [], refetch: refetchCategories } = useCategories();
  const categoryOptions = useMemo<SelectOption[]>(
    () => [{ id: ALL_CATEGORIES, label: 'All categories' }, ...categories.map(category => ({ id: category.id, label: category.name }))],
    [categories],
  );
  const { data: options, refetch: refetchOptions } = useListingFilterOptions();
  // A city chosen before is kept in the list even when nothing is for sale there any more, so it still reads as chosen.
  const cityOptions = useMemo<SelectOption[]>(() => {
    const cities = options?.cities ?? [];
    const listed = city && !cities.some(name => name.toLowerCase() === city.toLowerCase()) ? [city, ...cities] : cities;
    return [{ id: ALL_CITIES, label: 'All cities' }, ...listed.map(name => ({ id: name, label: name }))];
  }, [options?.cities, city]);
  const priceHint =
    options?.min_price != null && options.max_price != null
      ? `On the market now: ${formatRs(options.min_price)} to ${formatRs(options.max_price)}`
      : undefined;
  const categoryName = categoryId ? categories.find(category => category.id === categoryId)?.name : undefined;

  // The last text this bar sent up, so a change that did not come from typing (Clear filters on an empty result) can be
  // told apart and put back into the box.
  const sent = useRef(search);
  useEffect(() => {
    if (search !== sent.current) {
      sent.current = search;
      setText(search);
    }
  }, [search]);
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = trimmed;
      onSearchChange(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, onSearchChange]);

  const submitSearch = () => {
    const trimmed = text.trim();
    if (trimmed !== sent.current) {
      sent.current = trimmed;
      onSearchChange(trimmed);
    }
  };

  const activeCount = [minPrice, maxPrice, city, categoryId].filter(v => v !== null).length;

  const openSheet = (event?: GestureResponderEvent) => {
    // The panel spans the screen between the same margins as the page, just below the filter icon. Its top comes from
    // the press itself, not measureInWindow, which never answered on some Android phones (see AdminMenu); a press with
    // no position (TalkBack) opens the panel centred.
    const point = event?.nativeEvent;
    const left = Math.max(insets.left, theme.components.screen.margin);
    const right = Math.max(insets.right, theme.components.screen.margin);
    setAnchor(
      point && Number.isFinite(point.pageY) && Number.isFinite(point.locationY)
        ? { x: left, y: point.pageY - point.locationY, width: window.width - left - right, height: theme.size.touchMin }
        : null,
    );
    setDraftMin(minPrice === null ? '' : String(minPrice));
    setDraftMax(maxPrice === null ? '' : String(maxPrice));
    setDraftCity(city ?? '');
    setDraftCategory(categoryId);
    refetchCategories();
    refetchOptions();
    setSheetOpen(true);
  };

  const min = parseWhole(draftMin);
  const max = parseWhole(draftMax);
  const rangeError = min !== null && max !== null && max <= min ? 'The maximum must be more than the minimum' : undefined;

  const apply = () => {
    if (rangeError) return;
    onApplyMoreFilters({ minPrice: min, maxPrice: max, city: draftCity || null, categoryId: draftCategory });
    setSheetOpen(false);
  };

  const clear = () => {
    onApplyMoreFilters({ minPrice: null, maxPrice: null, city: null, categoryId: null });
    setSheetOpen(false);
  };

  const priceFilter =
    minPrice !== null && maxPrice !== null
      ? `${formatRs(minPrice)} to ${formatRs(maxPrice)}`
      : minPrice !== null
        ? `From ${formatRs(minPrice)}`
        : maxPrice !== null
          ? `Under ${formatRs(maxPrice)}`
          : null;
  const active = [
    priceFilter ? { key: 'price', label: priceFilter, remove: () => onApplyMoreFilters({ minPrice: null, maxPrice: null, city, categoryId }) } : null,
    city ? { key: 'city', label: city, remove: () => onApplyMoreFilters({ minPrice, maxPrice, city: null, categoryId }) } : null,
    categoryName ? { key: 'category', label: categoryName, remove: () => onApplyMoreFilters({ minPrice, maxPrice, city, categoryId: null }) } : null,
  ].filter((filter): filter is { key: string; label: string; remove: () => void } => filter !== null);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            placeholder="Search seeds, fertiliser, produce"
            accessibilityLabel="Search the market"
            value={text}
            onChangeText={setText}
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
        </View>
        <View style={styles.filterButton}>
          <IconButton
            icon={SlidersHorizontal}
            label="Filters"
            count={activeCount}
            countLabel={n => `${n} on`}
            onPress={openSheet}
          />
        </View>
      </View>

      {active.length > 0 ? (
        <View style={styles.active}>
          {active.map(filter => (
            <Pressable
              key={filter.key}
              style={styles.activeChip}
              onPress={filter.remove}
              android_ripple={{ color: theme.colors.ripple }}
              hitSlop={theme.components.hitSlop(theme.size.chip)}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter: ${filter.label}`}
            >
              <Text style={styles.activeLabel}>{filter.label}</Text>
              <X color={theme.colors.ink2} size={theme.size.iconSm} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Dropdown visible={sheetOpen} anchor={anchor} onClose={() => setSheetOpen(false)} label="Filters" maxHeight={theme.size.filterPanelMax}>
        {listMaxHeight => (
          <View style={styles.panel}>
            <ScrollView style={{ maxHeight: Math.max(0, listMaxHeight - footerHeight) }} contentContainerStyle={styles.panelBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.panelTitle} accessibilityRole="header">
                Filters
              </Text>
              <View style={styles.priceRow}>
                <View style={styles.priceField}>
                  <TextField
                    testID="filter-min-price"
                    label="Lowest price"
                    placeholder={options?.min_price != null ? String(Math.floor(options.min_price)) : undefined}
                    prefix="Rs"
                    numeric
                    optional
                    keyboardType="number-pad"
                    value={draftMin}
                    onChangeText={value => setDraftMin(digitsOnly(value))}
                  />
                </View>
                <View style={styles.priceField}>
                  <TextField
                    testID="filter-max-price"
                    label="Highest price"
                    placeholder={options?.max_price != null ? String(Math.ceil(options.max_price)) : undefined}
                    prefix="Rs"
                    numeric
                    optional
                    keyboardType="number-pad"
                    value={draftMax}
                    onChangeText={value => setDraftMax(digitsOnly(value))}
                    error={rangeError}
                  />
                </View>
              </View>

              {priceHint ? <Text style={styles.hint}>{priceHint}</Text> : null}

              <SelectField
                label="City"
                value={draftCity || ALL_CITIES}
                options={cityOptions}
                onSelect={id => setDraftCity(id === ALL_CITIES ? '' : id)}
              />

              <SelectField
                label="Category"
                value={draftCategory ?? ALL_CATEGORIES}
                options={categoryOptions}
                onSelect={id => setDraftCategory(id === ALL_CATEGORIES ? null : id)}
                searchable={false}
              />
            </ScrollView>
            <View style={styles.footer} onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}>
              <Button label="Show results" disabled={rangeError !== undefined} onPress={apply} />
              <Button label="Clear filters" variant="quiet" onPress={clear} />
            </View>
          </View>
        )}
      </Dropdown>
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme) {
  return StyleSheet.create({
    container: { paddingTop: space[3] },
    searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
    searchField: { flex: 1 },
    filterButton: { width: size.touchMin, height: size.input, alignItems: 'center', justifyContent: 'center' },
    active: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] },
    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      minHeight: size.chip,
      paddingHorizontal: space[3],
      borderRadius: radius.sm,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    activeLabel: { ...typography.label, color: colors.ink },
    panel: { padding: space[2] },
    panelBody: { gap: space[3], paddingBottom: space[3] },
    panelTitle: { ...typography.title, color: colors.ink },
    hint: { ...typography.caption, color: colors.ink2 },
    footer: { gap: space[2] },
    priceRow: { flexDirection: 'row', gap: space[3] },
    priceField: { flex: 1 },
  });
}
