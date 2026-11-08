import { SlidersHorizontal, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, ChipRow, IconButton, TextField, Sheet, type ChipOption } from '../../components';
import { useCrops } from '../hooks/marketplace';
import { useTheme, type Theme } from '../../../theme';
import { formatRs } from '../../../utils/money';
import type { Category } from '../types/marketplace';
import { digitsOnly, parseWhole } from '../utils/digits';

/** How long typing must pause before the feed is asked again: one request per word, not one per letter (MK-13). */
const SEARCH_DEBOUNCE_MS = 400;

interface MoreFilters {
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  cropName: string | null;
}

export interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  cropName: string | null;
  onApplyMoreFilters: (filters: MoreFilters) => void;
}

const ALL = 'all';

/** The market's search box, category chips, the filter sheet, and a removable chip for each filter in force. The sheet asks
 * for exactly what the API can filter by: price range, city and crop. */
export function FilterBar({
  search,
  onSearchChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  minPrice,
  maxPrice,
  city,
  cropName,
  onApplyMoreFilters,
}: FilterBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [text, setText] = useState(search);
  const [draftMin, setDraftMin] = useState('');
  const [draftMax, setDraftMax] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftCrop, setDraftCrop] = useState<string | null>(null);
  const { data: crops = [] } = useCrops();

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

  const activeCount = [minPrice, maxPrice, city, cropName].filter(v => v !== null).length;

  const openSheet = () => {
    setDraftMin(minPrice === null ? '' : String(minPrice));
    setDraftMax(maxPrice === null ? '' : String(maxPrice));
    setDraftCity(city ?? '');
    setDraftCrop(cropName);
    setSheetOpen(true);
  };

  const min = parseWhole(draftMin);
  const max = parseWhole(draftMax);
  const rangeError = min !== null && max !== null && max <= min ? 'The maximum must be more than the minimum' : undefined;

  const apply = () => {
    if (rangeError) return;
    onApplyMoreFilters({ minPrice: min, maxPrice: max, city: draftCity.trim() || null, cropName: draftCrop });
    setSheetOpen(false);
  };

  const clear = () => {
    onApplyMoreFilters({ minPrice: null, maxPrice: null, city: null, cropName: null });
    setSheetOpen(false);
  };

  const categoryOptions = useMemo<ChipOption<string>[]>(
    () => [{ value: ALL, label: 'All' }, ...categories.map(category => ({ value: category.id, label: category.name }))],
    [categories],
  );

  const priceFilter =
    minPrice !== null && maxPrice !== null
      ? `${formatRs(minPrice)} to ${formatRs(maxPrice)}`
      : minPrice !== null
        ? `From ${formatRs(minPrice)}`
        : maxPrice !== null
          ? `Under ${formatRs(maxPrice)}`
          : null;
  const active = [
    priceFilter ? { key: 'price', label: priceFilter, remove: () => onApplyMoreFilters({ minPrice: null, maxPrice: null, city, cropName }) } : null,
    city ? { key: 'city', label: city, remove: () => onApplyMoreFilters({ minPrice, maxPrice, city: null, cropName }) } : null,
    cropName ? { key: 'crop', label: cropName, remove: () => onApplyMoreFilters({ minPrice, maxPrice, city, cropName: null }) } : null,
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

      <ChipRow
        options={categoryOptions}
        value={selectedCategoryId ?? ALL}
        onChange={value => onSelectCategory(value === ALL ? null : value)}
      />

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

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        footer={
          <View style={styles.footer}>
            <Button label="Show results" size="lg" disabled={rangeError !== undefined} onPress={apply} />
            <Button label="Clear filters" variant="quiet" onPress={clear} />
          </View>
        }
      >
        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <TextField
              testID="filter-min-price"
              label="Lowest price"
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

        <TextField
          label="City"
          optional
          autoComplete="postal-address-locality"
          value={draftCity}
          onChangeText={setDraftCity}
        />

        {crops.length > 0 ? (
          <View style={styles.cropGroup}>
            <Text style={styles.groupLabel}>Crop</Text>
            <View style={styles.cropChips}>
              {crops.map(crop => (
                <Chip
                  key={crop.id}
                  label={crop.name}
                  selected={draftCrop === crop.name}
                  onPress={() => setDraftCrop(draftCrop === crop.name ? null : crop.name)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Sheet>
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
    footer: { gap: space[2] },
    priceRow: { flexDirection: 'row', gap: space[3] },
    priceField: { flex: 1 },
    cropGroup: { gap: space[2] },
    groupLabel: { ...typography.label, color: colors.ink },
    // Wrapped with a gap: touching chips share borders and touch areas (MK-17).
    cropChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  });
}
