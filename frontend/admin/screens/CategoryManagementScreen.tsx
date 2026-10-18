import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Pencil, Save, Tags, Trash2 } from 'lucide-react-native';
import { Button, EmptyState, ScreenState, Sheet, TextField, useToast } from '../../common/components';
import { useDeleteCategory, useSaveCategory } from '../hooks/admin';
import { useCategories, type Category } from '../../common/marketplace';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';

export function CategoryManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const actorId = useAuthStore(state => state.user?.id);
  const categories = useCategories();
  const { refetch } = categories;
  const toast = useToast();
  const saveCategory = useSaveCategory();
  const removeCategory = useDeleteCategory();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
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
      await saveCategory.mutateAsync({ id: editing?.id, input });
      setSheetOpen(false);
      toast.success(editing ? 'Category saved' : 'Category created');
    } catch (error) {
      toast.error(`Could not save the category. ${errorMessage(error)}`);
    } finally {
      setSavingId(null);
    }
  };

  // Deleting cannot be undone, so it is confirmed in a sheet first.
  const remove = (category: Category) => {
    if (!actorId) return;
    setDeleting(category);
  };

  const confirmRemove = async () => {
    const category = deleting;
    if (!category) return;
    setDeleting(null);
    setSavingId(category.id);
    try {
      await removeCategory.mutateAsync(category.id);
      toast.success('Category deleted');
    } catch (error) {
      toast.error(`Could not delete the category. ${errorMessage(error)}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenState query={categories} errorTitle="Couldn't load the categories">
        {data => (
          <FlashList
            contentContainerStyle={styles.list}
            data={data}
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
                    icon={Pencil}
                    variant="secondary"
                    fullWidth={false}
                    loading={savingId === item.id}
                    onPress={() => openEdit(item)}
                  />
                  <Button
                    label="Delete"
                    icon={Trash2}
                    variant="danger"
                    fullWidth={false}
                    loading={savingId === item.id}
                    onPress={() => remove(item)}
                  />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <EmptyState title="No categories yet" description="Add the first product category below." icon={Tags} />
            }
            ListFooterComponent={
              <Button
                label="+ Add Category"
                variant="secondary"
                onPress={openCreate}
                style={styles.addButton}
              />
            }
          />
        )}
      </ScreenState>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <View style={styles.sheet}>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Seeds"
          />
          <TextField
            label="Slug"
            value={slug}
            onChangeText={setSlug}
            placeholder="e.g. seeds"
            autoCapitalize="none"
          />
          <TextField
            label="Icon (optional)"
            value={icon}
            onChangeText={setIcon}
            placeholder="e.g. sprout"
          />
          <Button
            label={editing ? 'Save Changes' : 'Create Category'}
            icon={Save}
            loading={savingId === (editing?.id ?? 'new')}
            onPress={save}
          />
        </View>
      </Sheet>

      <Sheet visible={deleting !== null} onClose={() => setDeleting(null)} title="Delete category">
        <View style={styles.sheet}>
          <Text style={styles.sheetBody}>{`Delete "${deleting?.name ?? ''}"? This cannot be undone.`}</Text>
          <Button label="Delete" icon={Trash2} variant="danger" onPress={confirmRemove} />
          <Button label="Cancel" variant="secondary" onPress={() => setDeleting(null)} />
        </View>
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
    },
    row: {
      paddingVertical: space[3],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    info: {
      marginBottom: space[2],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    slug: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1] / 2,
    },
    actions: {
      flexDirection: 'row',
      gap: space[2],
    },
    addButton: {
      marginTop: space[4],
    },
    sheet: {
      gap: space[3],
    },
    sheetBody: {
      ...typography.body,
      color: colors.ink,
    },
  });
}
