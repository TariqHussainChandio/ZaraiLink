import { SlidersHorizontal } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Input, LocationPicker, Sheet } from '../../../components/ui';
import { useMarketplaceStore } from '../../../store/marketplaceStore';
import { useTheme, type Theme } from '../../../theme';
import type { Category } from '../../../types/marketplace';
import { CategoryChip } from './CategoryChip';

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
  onApplyMoreFilters: (filters: { minPrice: number | null; maxPrice: number | null; city: string | null; cropName: string | null }) => void;
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
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftMinPrice, setDraftMinPrice] = useState(minPrice ? String(minPrice) : '');
  const [draftMaxPrice, setDraftMaxPrice] = useState(maxPrice ? String(maxPrice) : '');
  const [draftCountry, setDraftCountry] = useState<string | null>(null);
  const [draftProvince, setDraftProvince] = useState<string | null>(null);
  const [draftCity, setDraftCity] = useState<string | null>(city);
  const [draftCropName, setDraftCropName] = useState<string | null>(cropName);

  const crops = useMarketplaceStore(state => state.crops);
  const loadCrops = useMarketplaceStore(state => state.loadCrops);

  useEffect(() => {
    loadCrops();
  }, [loadCrops]);

  const activeMoreFiltersCount = [minPrice, maxPrice, city, cropName].filter(v => v !== null).length;

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
    onApplyMoreFilters({ minPrice: null, maxPrice: null, city: null, cropName: null });
    setSheetOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Input
            placeholder="Search listings..."
            value={search}
            onChangeText={onSearchChange}
          />
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={
            activeMoreFiltersCount > 0 ? `Filters, ${activeMoreFiltersCount} active` : 'Filters'
          }
        >
          <SlidersHorizontal color={theme.colors.brand.primary} size={20} />
          {activeMoreFiltersCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeLabel}>{activeMoreFiltersCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <CategoryChip
          label="All"
          selected={selectedCategoryId === null}
          onPress={() => onSelectCategory(null)}
        />
        {categories.map(category => (
          <CategoryChip
            key={category.id}
            label={category.name}
            selected={selectedCategoryId === category.id}
            onPress={() => onSelectCategory(category.id)}
          />
        ))}
      </ScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Filters</Text>

          <View style={styles.priceRow}>
            <View style={styles.priceField}>
              <Input
                testID="filter-min-price"
                label="Min price"
                keyboardType="numeric"
                value={draftMinPrice}
                onChangeText={setDraftMinPrice}
              />
            </View>
            <View style={styles.priceField}>
              <Input
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
                  <CategoryChip
                    key={crop.id}
                    label={crop.name}
                    selected={draftCropName === crop.name}
                    onPress={() => setDraftCropName(draftCropName === crop.name ? null : crop.name)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Button label="Apply Filters" onPress={apply} style={styles.applyButton} />
          <Button label="Clear Filters" variant="secondary" onPress={clear} />
        </ScrollView>
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    searchField: {
      flex: 1,
    },
    filterButton: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: colors.brand.primary,
      borderRadius: radii.full,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeLabel: {
      color: colors.neutral.white,
      fontSize: 10,
      fontWeight: '700',
    },
    chipRow: {
      paddingBottom: spacing.md,
    },
    sheetTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    priceRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    priceField: {
      flex: 1,
    },
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium as any,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    applyButton: {
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
  });
}
