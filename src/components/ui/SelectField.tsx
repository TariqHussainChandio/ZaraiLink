import React, { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { lightTheme } from '../../theme';
import { EmptyState } from './EmptyState';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';

export interface SelectOption {
  id: string;
  label: string;
}

export interface SelectFieldProps {
  label?: string;
  placeholder?: string;
  value: string | null;
  options: SelectOption[];
  onSelect: (id: string) => void;
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
}

const { colors, spacing, radii, typography } = lightTheme;

export function SelectField({
  label,
  placeholder = 'Select...',
  value,
  options,
  onSelect,
  error,
  disabled,
  loading,
  searchable = true,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find(option => option.id === value)?.label ?? null;

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const needle = query.trim().toLowerCase();
    return options.filter(option => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[styles.field, error && styles.fieldError, disabled && styles.fieldDisabled]}
        disabled={disabled || loading}
        onPress={() => setOpen(true)}
      >
        <Text style={selectedLabel ? styles.value : styles.placeholder} numberOfLines={1}>
          {loading ? 'Loading…' : (selectedLabel ?? placeholder)}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Sheet visible={open} onClose={close}>
        {searchable ? (
          <TextInput
            style={styles.search}
            placeholder="Search"
            placeholderTextColor={colors.neutral.gray400}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        ) : null}
        {loading ? (
          <Spinner />
        ) : (
          <FlatList
            data={filteredOptions}
            keyExtractor={item => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState title="No results" />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  onSelect(item.id);
                  close();
                }}
              >
                <Text style={item.id === value ? styles.optionLabelSelected : styles.optionLabel}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
    marginBottom: spacing.xs,
  },
  field: {
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.neutral.white,
  },
  fieldError: {
    borderColor: colors.semantic.error,
  },
  fieldDisabled: {
    backgroundColor: colors.neutral.gray100,
  },
  value: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
  },
  placeholder: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray400,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.xs,
    color: colors.semantic.error,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 320,
  },
  option: {
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  optionLabel: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
  },
  optionLabelSelected: {
    fontSize: typography.sizes.base,
    color: colors.brand.primary,
    fontWeight: typography.weights.semibold as any,
  },
});
