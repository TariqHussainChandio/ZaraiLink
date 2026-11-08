import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Banner, Button, ListGroup, ListRow, QueryState, ScreenScaffold, Sheet, StickyActionBar, TextField } from '../../common/components';
import { useCategories, type Category } from '../../common/marketplace';
import { errorMessage } from '../../utils/errorMessage';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { useDeleteCategory, useSaveCategory } from '../hooks/admin';

// The machine name of a new category, made from its name: "Farm tools" becomes "farm-tools". Nobody types it (AD-15); it
// is not changed when a category is renamed, because listings and links may already use it.
function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The marketplace categories (SRDS §8). Every change is audited by the API (BR-15). */
export function CategoryManagementScreen() {
  const query = useCategories();
  const { data: categories = [], refetch } = query;
  const saveCategory = useSaveCategory();
  const removeCategory = useDeleteCategory();
  const [selected, setSelected] = useState<Category | null>(null);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<AdminAction | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const openEditor = (category: Category | 'new') => {
    setSelected(null);
    setName(category === 'new' ? '' : category.name);
    setNameError(undefined);
    setFailure(null);
    setEditing(category);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError('Give the category a name of at least 2 letters');
      return;
    }
    const current = editing;
    const slug = current && current !== 'new' ? current.slug : slugFrom(trimmed);
    if (!slug) {
      setNameError('Use letters or numbers in the name');
      return;
    }
    setNameError(undefined);
    setFailure(null);
    setSaving(true);
    try {
      await saveCategory.mutateAsync({
        id: current && current !== 'new' ? current.id : undefined,
        input: { name: trimmed, slug, icon: current && current !== 'new' ? current.icon : null },
      });
      setEditing(null);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (category: Category) => {
    setSelected(null);
    setAction({
      title: `Delete ${category.name}?`,
      message: `"${category.name}" is removed from the category list. This cannot be undone.`,
      confirmLabel: `Delete ${category.name}`,
      destructive: true,
      run: () => removeCategory.mutateAsync(category.id),
      done: `${category.name} deleted`,
    });
  };

  return (
    <>
      <ScreenScaffold
        onRefresh={() => refetch()}
        refreshing={query.isRefetching}
        footer={
          <StickyActionBar>
            <Button label="Add a category" size="lg" onPress={() => openEditor('new')} />
          </StickyActionBar>
        }
      >
        <QueryState
          query={query}
          failureTitle="Couldn't load categories"
          isEmpty={categories.length === 0}
          empty={{ title: 'No categories yet', description: 'Add the first marketplace category.' }}
        >
          <ListGroup>
            {categories.map(category => (
              <ListRow key={category.id} title={category.name} onPress={() => setSelected(category)} />
            ))}
          </ListGroup>
        </QueryState>
      </ScreenScaffold>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? 'Category'}>
        <ListGroup>
          <ListRow title="Rename category" onPress={() => selected && openEditor(selected)} />
          <ListRow title={`Delete ${selected?.name ?? 'category'}`} onPress={() => selected && askDelete(selected)} />
        </ListGroup>
      </Sheet>

      <Sheet
        visible={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? 'New category' : 'Rename category'}
        footer={<Button label={editing === 'new' ? 'Add category' : 'Save category'} size="lg" loading={saving} onPress={save} />}
      >
        <TextField label="Name" placeholder="Seeds" value={name} onChangeText={setName} error={nameError} editable={!saving} />
        {failure ? (
          <Banner tone="danger" title="Couldn't save the category">
            {failure}
          </Banner>
        ) : null}
      </Sheet>

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}
