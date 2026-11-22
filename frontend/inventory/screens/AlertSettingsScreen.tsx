import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { Banner, Button, Card, ScreenState, TextField, useToast } from '../../common/components';
import { useRoleAccent, useTheme } from '../../theme';
import { optionalNumber } from '../components/formValues';
import { makeScreenStyles } from '../components/screenStyles';
import { inventoryErrorMessage } from '../hooks/errors';
import { useAlertSettings, useSaveAlertSettings } from '../hooks/inventory';
import type { INVENTORY_ROUTES, InventoryScreenProps } from '../types/navigation';

interface ToggleProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, description, value, onChange }: ToggleProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text style={styles.body}>{label}</Text>
        <Text style={styles.caption}>{description}</Text>
      </View>
      {/* Android: a Switch is found by role only with `accessible` and a label (AGENTS.md). */}
      <Switch
        accessible
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: accent.mark, false: theme.colors.lineStrong }}
      />
    </View>
  );
}

/** SRDS §24: the default reorder level for products without their own, and which events notify the dealer. A
 * product's own threshold is set on its edit screen. */
export function AlertSettingsScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.AlertSettings>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const result = useAlertSettings();
  const { data } = result;
  const save = useSaveAlertSettings();
  const toast = useToast();
  const [threshold, setThreshold] = useState('');
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifySyncFailure, setNotifySyncFailure] = useState(true);
  const [thresholdError, setThresholdError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const filled = useRef(false);
  useEffect(() => {
    if (!data || filled.current) return;
    filled.current = true;
    setThreshold(String(data.default_reorder_threshold));
    setNotifyLowStock(data.notify_low_stock);
    setNotifySyncFailure(data.notify_sync_failure);
  }, [data]);

  if (!data) {
    return (
      <View style={styles.screen}>
        <ScreenState query={result} errorTitle="Couldn't load your alert settings" />
      </View>
    );
  }

  const onSave = async () => {
    setFormError(null);
    const parsed = optionalNumber.safeParse(threshold);
    if (!parsed.success || threshold.trim() === '') {
      setThresholdError('Enter a number, such as 10');
      return;
    }
    setThresholdError(undefined);
    try {
      await save.mutateAsync({
        default_reorder_threshold: Number(threshold),
        notify_low_stock: notifyLowStock,
        notify_sync_failure: notifySyncFailure,
      });
      toast.success('Alert settings saved');
      navigation.goBack();
    } catch (err) {
      setFormError(inventoryErrorMessage(err));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextField
        label="Default reorder threshold"
        numeric
        keyboardType="decimal-pad"
        value={threshold}
        onChangeText={setThreshold}
        helper="Used for products that have no threshold of their own."
        error={thresholdError}
      />
      <Card style={styles.actions}>
        <Toggle
          label="Low stock"
          description="Notify me when a product reaches its reorder level or runs out."
          value={notifyLowStock}
          onChange={setNotifyLowStock}
        />
        <Toggle
          label="Marketplace sync failures"
          description="Notify me when a dispatched order could not be taken from my stock."
          value={notifySyncFailure}
          onChange={setNotifySyncFailure}
        />
      </Card>
      {formError ? (
        <Banner tone="danger" title="Not saved">
          {formError}
        </Banner>
      ) : null}
      <Button label="Save settings" loading={save.isPending} onPress={onSave} />
    </ScrollView>
  );
}
