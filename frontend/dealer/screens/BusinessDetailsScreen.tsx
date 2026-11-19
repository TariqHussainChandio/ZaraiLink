import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { DealerBusinessStep } from '../../common/auth';
import { ScreenScaffold, useToast } from '../../common/components';

/** An approved dealer's business details (SRDS §7), the same form as the application's business step. */
export function BusinessDetailsScreen() {
  const navigation = useNavigation();
  // The toast, not the snackbar: it is announced to TalkBack even as the screen closes behind it (A8).
  const toast = useToast();
  return (
    <ScreenScaffold>
      <DealerBusinessStep
        submitLabel="Save details"
        onDone={() => {
          toast.success('Business details saved');
          navigation.goBack();
        }}
      />
    </ScreenScaffold>
  );
}
