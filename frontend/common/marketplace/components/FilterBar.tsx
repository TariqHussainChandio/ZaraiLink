import { Check, SlidersHorizontal, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Chip,
  LocationPicker,
  Sheet,
  TextField,
} from '../../components';
import { useCrops } from '../hooks/marketplace';
import {
  useTheme,
  type Theme,
  useRoleAccent,
  type Accent,
} from '../../../theme';
import type { Category } from '../types/marketplace';

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
  onApplyMoreFilters: (filters: {
    minPrice: number | null;
    maxPrice: number | null;
    city: string | null;
    cropName: string | null;
  }) => void;
}

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
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftMinPrice, setDraftMinPrice] = useState(
    minPrice ? String(minPrice) : '',
  );
  const [draftMaxPrice, setDraftMaxPrice] = useState(
    maxPrice ? String(maxPrice) : '',
  );
  const [draftCountry, setDraftCountry] = useState<string | null>(null);
  const [draftProvince, setDraftProvince] = useState<string | null>(null);
  const [draftCity, setDraftCity] = useState<string | null>(city);
  const [draftCropName, setDraftCropName] = useState<string | null>(cropName);

  const { data: crops = [] } = useCrops();

  const activeMoreFiltersCount = [minPrice, maxPrice, city, cropName].filter(
    v => v !== null,
  ).length;

  const openSheet = () => {
    setDraftMinPrice(minPrice ? String(minPrice) : '');
    setDraftMaxPrice(maxPrice ? String(maxPrice) : '');
    setDraftCity(city);
    setDraftCropName(cropName);
    setSheetOpen(true);
  };

  const apply = () => {
    onApplyMoreFilters({
      minPrice: draftMinPrice ? Number(draftMinPrice) : null,
      maxPrice: draftMaxPrice ? Number(draftMaxPrice) : null,
      city: draftCity,
      cropName: draftCropName,
    });
    setSheetOpen(false);
  };

  const clear = () => {
    setDraftMinPrice('');
    setDraftMaxPrice('');
    setDraftCountry(null);
    setDraftProvince(null);
    setDraftCity(null);
    setDraftCropName(null);
    onApplyMoreFilters({
      minPrice: null,
      maxPrice: null,
      city: null,
      cropName: null,
    });
    setSheetOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            placeholder="Search listings..."
            accessibilityLabel="Search listings"
            value={search}
            onChangeText={onSearchChange}
          />
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={
            activeMoreFiltersCount > 0
              ? `Filters, ${activeMoreFiltersCount} active`
              : 'Filters'
          }
        >
          <SlidersHorizontal color={accent.mark} size={theme.size.iconButton} />
          {activeMoreFiltersCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeLabel}>
                {activeMoreFiltersCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label="All"
          selected={selectedCategoryId === null}
          onPress={() => onSelectCategory(null)}
        />
        {categories.map(category => (
          <Chip
            key={category.id}
            label={category.name}
            selected={selectedCategoryId === category.id}
            onPress={() => onSelectCategory(category.id)}
          />
        ))}
      </ScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Filters
          </Text>

          <View style={styles.priceRow}>
            <View style={styles.priceField}>
              <TextField
                testID="filter-min-price"
                label="Min price"
                keyboardType="numeric"
                value={draftMinPrice}
                onChangeText={setDraftMinPrice}
              />
            </View>
            <View style={styles.priceField}>
              <TextField
                testID="filter-max-price"
                label="Max price"
                keyboardType="numeric"
                value={draftMaxPrice}
                onChangeText={setDraftMaxPrice}
              />
            </View>
          </View>

          <LocationPicker
            country={draftCountry}
            province={draftProvince}
            city={draftCity}
            onCountryChange={setDraftCountry}
            onProvinceChange={setDraftProvince}
            onCityChange={setDraftCity}
          />

          {crops.length > 0 ? (
            <>
              <Text style={styles.label}>Crop</Text>
              <View style={styles.chipRow}>
                {crops.map(crop => (
                  <Chip
                    key={crop.id}
                    label={crop.name}
                    selected={draftCropName === crop.name}
                    onPress={() =>
                      setDraftCropName(
                        draftCropName === crop.name ? null : crop.name,
                      )
                    }
                  />
                ))}
              </View>
            </>
          ) : null}

          <Button
            label="Apply Filters"
            icon={Check}
            onPress={apply}
            style={styles.applyButton}
          />
          <Button
            label="Clear Filters"
            icon={X}
            variant="secondary"
            onPress={clear}
          />
        </ScrollView>
      </Sheet>
    </View>
  );
}

function makeStyles(
  { colors, space, radius, typography, size, borders, fontWeight }: Theme,
  accent: Accent,
) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: space[4],
      paddingTop: space[3],
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[2],
    },
    searchField: {
      flex: 1,
    },
    filterButton: {
      width: size.touchMin,
      height: size.touchMin,
      borderRadius: radius.sm,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: -space[1],
      right: -space[1],
      backgroundColor: accent.fill,
      borderRadius: radius.pill,
      minWidth: size.countBadge,
      height: size.countBadge,
      paddingHorizontal: space[1],
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeLabel: {
      color: colors.onAccent,
      ...typography.code,
      fontWeight: fontWeight.bold,
    },
    chipRow: {
      paddingBottom: space[3],
    },
    sheetTitle: {
      ...typography.title,
      color: colors.ink,
      marginBottom: space[3],
    },
    priceRow: {
      flexDirection: 'row',
      gap: space[3],
    },
    priceField: {
      flex: 1,
    },
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1],
    },
    applyButton: {
      marginTop: space[3],
      marginBottom: space[2],
    },
  });
}
