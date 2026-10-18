import { Download } from 'lucide-react-native';
import React from 'react';
import { Linking } from 'react-native';
import { Button, useToast } from '../../common/components';
import { inventoryErrorMessage } from '../hooks/errors';
import { useCreateExport } from '../hooks/inventory';
import type { ReportName, ReportRange } from '../types/inventory';

export interface ExportButtonProps {
  report: ReportName;
  /** The period of a period report; reconciliation has none (it is all-time). */
  range?: ReportRange;
}

/**
 * "Export CSV": the server writes the report to the dealer's private exports folder and returns a signed link that
 * expires soon, which the phone opens with the system's own handler (maintainer decision: `Linking.openURL`, no new
 * native module). Offline it fails at once with the inventory system's offline message, like every write.
 */
export function ExportButton({ report, range }: ExportButtonProps) {
  const toast = useToast();
  const create = useCreateExport();

  const onExport = async () => {
    try {
      const { url } = await create.mutateAsync({ report, from: range?.from ?? null, to: range?.to ?? null });
      await Linking.openURL(url);
      toast.success('Your file is ready');
    } catch (error) {
      toast.error(inventoryErrorMessage(error));
    }
  };

  return <Button label="Export CSV" variant="secondary" icon={Download} loading={create.isPending} onPress={onExport} />;
}
