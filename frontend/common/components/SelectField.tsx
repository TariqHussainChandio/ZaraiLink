import { Check, ChevronDown, CircleAlert } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import { EmptyState } from './EmptyState';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';

/**
 * Up to this many options render in a plain ScrollView; a longer list is virtualised with FlashList.
 *
 * Why two paths: FlashList v2 sizes its render window from the measured height of its own outer view. Inside the
 * Sheet that view has no height of its own (only a `maxHeight`), so it measured 0, FlashList rendered no rows, and the
 * empty content kept it at 0: on Android the picker showed no options and no empty text (B3 verification, N1). A
 * ScrollView with `maxHeight` grows with its rows up to the cap, which is what a short picker needs; a long one gets a
 * fixed height, the bounded parent FlashList requires.
 */
const VIRTUALISE_ABOVE = 50;

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

/** Units, categories, provinces and cities always come from a select, never free text. It shares TextField's label and
 * box, and a chevron says it opens a list. */
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

  const renderOption = (item: SelectOption) => (
    <Pressable
      key={item.id}
      style={styles.option}
      onPress={() => {
        onSelect(item.id);
        close();
      }}
      android_ripple={{ color: theme.colors.ripple }}
      accessibilityRole="button"
      accessibilityState={{ selected: item.id === value }}
    >
      <Text style={item.id === value ? styles.optionLabelSelected : styles.optionLabel}>{item.label}</Text>
      {item.id === value ? <Check color={accent.ink} size={theme.size.iconButton} /> : null}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.field, error && styles.fieldError, disabled && styles.fieldDisabled]}
        disabled={disabled || loading}
        onPress={() => setOpen(true)}
        android_ripple={{ color: theme.colors.ripple }}
        accessibilityRole="button"
        accessibilityLabel={[label, selectedLabel ?? placeholder].filter(Boolean).join(', ')}
        accessibilityHint={error}
        accessibilityState={{ disabled: disabled || loading }}
      >
        <Text style={selectedLabel ? styles.value : styles.placeholder} numberOfLines={1}>
          {loading ? 'Loading…' : (selectedLabel ?? placeholder)}
        </Text>
        <ChevronDown color={disabled ? theme.colors.inkDisabled : theme.colors.ink2} size={theme.size.iconMd} />
      </Pressable>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <CircleAlert color={theme.colors.status.danger.mark} size={theme.size.iconSm} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {/* The list scrolls itself (FlashList), so the sheet's own scrolling body is switched off. */}
      <Sheet visible={open} onClose={close} title={label ?? 'Choose an option'} scroll={false}>
        {searchable ? (
          <TextInput
            style={styles.search}
            placeholder="Search"
            placeholderTextColor={theme.colors.ink3}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        ) : null}
        {loading ? (
          <Spinner />
        ) : filteredOptions.length > VIRTUALISE_ABOVE ? (
          <FlashList
            data={filteredOptions}
            keyExtractor={item => item.id}
            style={styles.longList}
            // Inside the Sheet's own scrolling body, the picker's list scrolls by itself on Android.
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => renderOption(item)}
          />
        ) : (
          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filteredOptions.length === 0 ? <EmptyState title="No results" /> : filteredOptions.map(item => renderOption(item))}
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, size, borders, components }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      marginBottom: space[4],
      gap: space[2],
    },
    // The same label as TextField's, so a select and a text field in one form read alike.
    label: {
      ...typography.label,
      color: colors.ink,
    },
    // The same box as TextField, so a select and a text field in one form look alike.
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: components.input.gap,
      minHeight: components.input.height,
      paddingHorizontal: components.input.paddingX,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: components.input.radius,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    fieldError: {
      borderColor: colors.status.danger.mark,
      borderWidth: borders.focus,
    },
    fieldDisabled: {
      backgroundColor: colors.surfaceSunken,
      borderColor: colors.line,
    },
    value: {
      ...typography.bodyLg,
      flex: 1,
      color: colors.ink,
    },
    placeholder: {
      ...typography.bodyLg,
      flex: 1,
      color: colors.ink3,
    },
    errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
    error: {
      ...typography.caption,
      flex: 1,
      color: colors.status.danger.mark,
    },
    search: {
      minHeight: components.input.height,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: radius.sm,
      paddingHorizontal: space[3],
      ...typography.bodyLg,
      color: colors.ink,
      marginBottom: space[3],
    },
    // Grows with its rows up to the cap, then scrolls.
    list: {
      maxHeight: size.sheetListMax,
      flexGrow: 0,
    },
    // FlashList needs a parent with a real height (see VIRTUALISE_ABOVE).
    longList: {
      height: size.sheetListMax,
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
