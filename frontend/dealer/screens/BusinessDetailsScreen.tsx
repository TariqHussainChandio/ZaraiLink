import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { DealerBusinessStep } from '../../common/auth';
import { ScreenScaffold, useSnackbar } from '../../common/components';

/** An approved dealer's business details (SRDS §7), the same form as the application's business step. */
export function BusinessDetailsScreen() {
  const navigation = useNavigation();
  const snackbar = useSnackbar();
  return (
    <ScreenScaffold>
      <DealerBusinessStep
        submitLabel="Save details"
        onDone={() => {
          snackbar.show('Business details saved');
          navigation.goBack();
        }}
      />
    </ScreenScaffold>
  );
}
