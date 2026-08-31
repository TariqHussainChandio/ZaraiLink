import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Input, Sheet, Spinner } from '../../components/ui';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { Category } from '../../types/marketplace';

export function CategoryManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const actorId = useAuthStore(state => state.user?.id);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setCategories(await fetchCategories());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSlug('');
    setIcon('');
    setSheetOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setSlug(category.slug);
    setIcon(category.icon ?? '');
    setSheetOpen(true);
  };

  const save = async () => {
    if (!actorId || !name.trim() || !slug.trim()) return;
    setSavingId(editing?.id ?? 'new');
    try {
      const input = { name: name.trim(), slug: slug.trim(), icon: icon.trim() || null };
      if (editing) {
        await updateCategory(editing.id, input);
      } else {
        await createCategory(input);
      }
      setSheetOpen(false);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const remove = (category: Category) => {
    if (!actorId) return;
    Alert.alert('Delete category', `Delete "${category.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSavingId(category.id);
          try {
            await deleteCategory(category.id);
            await load();
          } finally {
            setSavingId(null);
          }
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={categories}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.slug}>{item.slug}</Text>
            </View>
            <View style={styles.actions}>
              <Button
                label="Edit"
                variant="secondary"
                fullWidth={false}
                loading={savingId === item.id}
                onPress={() => openEdit(item)}
              />
              <Button
                label="Delete"
                variant="destructive"
                fullWidth={false}
                loading={savingId === item.id}
                onPress={() => remove(item)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState title="No categories yet" description="Add the first product category below." />
        }
        ListFooterComponent={
          <Button label="+ Add Category" variant="secondary" onPress={openCreate} style={styles.addButton} />
        }
      />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>{editing ? 'Edit Category' : 'New Category'}</Text>
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Seeds" />
        <Input label="Slug" value={slug} onChangeText={setSlug} placeholder="e.g. seeds" autoCapitalize="none" />
        <Input label="Icon (optional)" value={icon} onChangeText={setIcon} placeholder="e.g. sprout" />
        <Button
          label={editing ? 'Save Changes' : 'Create Category'}
          loading={savingId === (editing?.id ?? 'new')}
          onPress={save}
        />
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      padding: spacing.lg,
    },
    row: {
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    info: {
      marginBottom: spacing.sm,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    slug: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginTop: spacing.xs / 2,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    addButton: {
      marginTop: spacing.lg,
    },
    sheetTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
      marginBottom: spacing.lg,
    },
  });
}
