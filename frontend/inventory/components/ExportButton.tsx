import { Download } from 'lucide-react-native';
import React from 'react';
import { Linking } from 'react-native';
import { Button, useToast } from '../../common/components';
import { inventoryErrorMessage } from '../hooks/errors';
import { useCreateExport } from '../hooks/inventory';
import { isOfflineWrite } from '../hooks/mutation';
import type { ReportName, ReportRange } from '../types/inventory';

const OFFLINE = "You're offline. Connect to the internet to export this report.";
const NOT_OPENED = "The file was made but this phone couldn't open it. Export it again to get a new link.";

/**
 * "Export CSV": the server writes the report to the dealer's private exports folder and returns a signed link that
 * expires in ten minutes, which the phone opens at once with the system's own handler (maintainer decision:
 * `Linking.openURL`, no new native module). The link is never kept: each press makes a new one, so an expired link
 * cannot be opened from here. Offline it is refused before anything is sent, like every write; a link the phone cannot
 * open says so instead of showing the system's error.
 */
export function ExportButton({ report, range }: ExportButtonProps) {
  const toast = useToast();
  const create = useCreateExport();

  const onExport = async () => {
    let url: string;
    try {
      ({ url } = await create.mutateAsync({ report, from: range?.from ?? null, to: range?.to ?? null }));
    } catch (error) {
      toast.error(isOfflineWrite(error) ? OFFLINE : inventoryErrorMessage(error));
      return;
    }
    try {
      await Linking.openURL(url);
      toast.success('Your file is ready. The link works for 10 minutes.');
    } catch {
      toast.error(NOT_OPENED);
    }
  };

  return <Button label="Export CSV" variant="secondary" icon={Download} loading={create.isPending} onPress={onExport} />;
}

export interface ExportButtonProps {
  report: ReportName;
  /** The period of a period report; reconciliation has none (it is all-time). */
  range?: ReportRange;
}
