import { Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
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
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
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
        accessibilityRole="button"
        accessibilityLabel={[label, selectedLabel ?? placeholder].filter(Boolean).join(', ')}
        accessibilityState={{ disabled: disabled || loading }}
      >
        <Text style={selectedLabel ? styles.value : styles.placeholder} numberOfLines={1}>
          {loading ? 'Loading…' : (selectedLabel ?? placeholder)}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Sheet visible={open} onClose={close} title={label}>
        {searchable ? (
          <TextInput
            style={styles.search}
            placeholder="Search"
            placeholderTextColor={theme.colors.ink2}
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
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === value }}
              >
                <Text style={item.id === value ? styles.optionLabelSelected : styles.optionLabel}>
                  {item.label}
                </Text>
                {item.id === value ? <Check color={accent.ink} size={theme.size.iconButton} /> : null}
              </TouchableOpacity>
            )}
          />
        )}
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, size, borders, components }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      marginBottom: space[3],
    },
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1],
    },
    // The same box as TextField, so a select and a text field in one form look alike.
    field: {
      justifyContent: 'center',
      minHeight: components.input.height,
      paddingHorizontal: components.input.paddingX,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: components.input.radius,
      backgroundColor: colors.surface,
    },
    fieldError: {
      borderColor: colors.status.danger.mark,
    },
    fieldDisabled: {
      backgroundColor: colors.ground,
    },
    value: {
      ...typography.body,
      color: colors.ink,
    },
    placeholder: {
      ...typography.body,
      color: colors.ink2,
    },
    error: {
      marginTop: space[1],
      ...typography.caption,
      color: colors.status.danger.mark,
    },
    search: {
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderRadius: radius.sm,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      ...typography.body,
      color: colors.ink,
      marginBottom: space[3],
    },
    list: {
      maxHeight: size.sheetListMax,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[2],
      minHeight: size.touchMin,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    optionLabel: {
      ...typography.body,
      color: colors.ink,
    },
    optionLabelSelected: {
      ...typography.bodyStrong,
      color: accent.ink,
    },
  });
}
