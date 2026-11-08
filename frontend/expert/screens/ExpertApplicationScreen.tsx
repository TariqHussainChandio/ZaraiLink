import React from 'react';
import { ExpertProfessionalStep } from '../../common/auth';
import { ScreenScaffold, useSnackbar } from '../../common/components';

/**
 * The expert's professional profile: what clients see in the directory. A pending expert fills it in as the first step
 * of their application (ApplicationWizardScreen, A3b); an approved expert keeps it current here, in the same form, so the
 * labels, the rules and the load-failure handling are the application's own.
 */
export function ExpertApplicationScreen() {
  const snackbar = useSnackbar();
  return (
    <ScreenScaffold>
      <ExpertProfessionalStep submitLabel="Save profile" onDone={() => snackbar.show('Professional profile saved')} />
    </ScreenScaffold>
  );
}
