import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTheme, type Theme } from '../../theme';
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
            placeholderTextColor={theme.colors.text.secondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        ) : null}
        {loading ? (
          <Spinner />
        ) : (
          <FlashList
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

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    field: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      backgroundColor: colors.background.surface,
    },
    fieldError: {
      borderColor: colors.semantic.error,
    },
    fieldDisabled: {
      backgroundColor: colors.background.default,
    },
    value: {
      fontSize: typography.sizes.base,
      color: colors.text.primary,
    },
    placeholder: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
    },
    error: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.xs,
      color: colors.semantic.error,
    },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    list: {
      maxHeight: 320,
    },
    option: {
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLabel: {
      fontSize: typography.sizes.base,
      color: colors.text.primary,
    },
    optionLabelSelected: {
      fontSize: typography.sizes.base,
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold,
    },
  });
}
