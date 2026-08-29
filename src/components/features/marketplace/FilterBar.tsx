import { SlidersHorizontal } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Input, LocationPicker, Sheet } from '../../../components/ui';
import { useMarketplaceStore } from '../../../store/marketplaceStore';
import { lightTheme } from '../../../theme';
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
  cityId: string | null;
  cropName: string | null;
  onApplyMoreFilters: (filters: { minPrice: number | null; maxPrice: number | null; cityId: string | null; cropName: string | null }) => void;
}

const { colors, spacing, radii, typography } = lightTheme;

export function FilterBar({
  search,
  onSearchChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  minPrice,
  maxPrice,
  cityId,
  cropName,
  onApplyMoreFilters,
}: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftMinPrice, setDraftMinPrice] = useState(minPrice ? String(minPrice) : '');
  const [draftMaxPrice, setDraftMaxPrice] = useState(maxPrice ? String(maxPrice) : '');
  const [draftCountryId, setDraftCountryId] = useState<string | null>(null);
  const [draftProvinceId, setDraftProvinceId] = useState<string | null>(null);
  const [draftCityId, setDraftCityId] = useState<string | null>(cityId);
  const [draftCropName, setDraftCropName] = useState<string | null>(cropName);

  const crops = useMarketplaceStore(state => state.crops);
  const loadCrops = useMarketplaceStore(state => state.loadCrops);

  useEffect(() => {
    loadCrops();
  }, [loadCrops]);

  const activeMoreFiltersCount = [minPrice, maxPrice, cityId, cropName].filter(v => v !== null).length;

  const openSheet = () => {
    setDraftMinPrice(minPrice ? String(minPrice) : '');
    setDraftMaxPrice(maxPrice ? String(maxPrice) : '');
    setDraftCityId(cityId);
    setDraftCropName(cropName);
    setSheetOpen(true);
  };

  const apply = () => {
    onApplyMoreFilters({
      minPrice: draftMinPrice ? Number(draftMinPrice) : null,
      maxPrice: draftMaxPrice ? Number(draftMaxPrice) : null,
      cityId: draftCityId,
      cropName: draftCropName,
    });
    setSheetOpen(false);
  };

  const clear = () => {
    setDraftMinPrice('');
    setDraftMaxPrice('');
    setDraftCountryId(null);
    setDraftProvinceId(null);
    setDraftCityId(null);
    setDraftCropName(null);
    onApplyMoreFilters({ minPrice: null, maxPrice: null, cityId: null, cropName: null });
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
        <TouchableOpacity style={styles.filterButton} onPress={openSheet}>
          <SlidersHorizontal color={colors.brand.primary} size={20} />
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
                label="Min price"
                keyboardType="numeric"
                value={draftMinPrice}
                onChangeText={setDraftMinPrice}
              />
            </View>
            <View style={styles.priceField}>
              <Input
                label="Max price"
                keyboardType="numeric"
                value={draftMaxPrice}
                onChangeText={setDraftMaxPrice}
              />
            </View>
          </View>

          <LocationPicker
            countryId={draftCountryId}
            provinceId={draftProvinceId}
            cityId={draftCityId}
            onCountryChange={setDraftCountryId}
            onProvinceChange={setDraftProvinceId}
            onCityChange={setDraftCityId}
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

const styles = StyleSheet.create({
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
    borderColor: colors.neutral.gray300,
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
    color: colors.neutral.gray900,
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
    color: colors.neutral.gray700,
    marginBottom: spacing.xs,
  },
  applyButton: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
