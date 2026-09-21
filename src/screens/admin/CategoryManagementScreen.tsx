import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    Alert.alert(
      t('admin.categoryManagement.deleteConfirmTitle'),
      t('admin.categoryManagement.deleteConfirmMessage', { name: category.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.categoryManagement.delete'),
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
      ],
    );
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
                label={t('admin.categoryManagement.edit')}
                variant="secondary"
                fullWidth={false}
                loading={savingId === item.id}
                onPress={() => openEdit(item)}
              />
              <Button
                label={t('admin.categoryManagement.delete')}
                variant="destructive"
                fullWidth={false}
                loading={savingId === item.id}
                onPress={() => remove(item)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('admin.categoryManagement.emptyTitle')}
            description={t('admin.categoryManagement.emptyDescription')}
          />
        }
        ListFooterComponent={
          <Button
            label={t('admin.categoryManagement.addCategory')}
            variant="secondary"
            onPress={openCreate}
            style={styles.addButton}
          />
        }
      />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>
          {editing ? t('admin.categoryManagement.editCategoryTitle') : t('admin.categoryManagement.newCategoryTitle')}
        </Text>
        <Input
          label={t('admin.categoryManagement.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('admin.categoryManagement.namePlaceholder')}
        />
        <Input
          label={t('admin.categoryManagement.slugLabel')}
          value={slug}
          onChangeText={setSlug}
          placeholder={t('admin.categoryManagement.slugPlaceholder')}
          autoCapitalize="none"
        />
        <Input
          label={t('admin.categoryManagement.iconLabel')}
          value={icon}
          onChangeText={setIcon}
          placeholder={t('admin.categoryManagement.iconPlaceholder')}
        />
        <Button
          label={editing ? t('admin.categoryManagement.saveChangesButton') : t('admin.categoryManagement.createCategoryButton')}
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
