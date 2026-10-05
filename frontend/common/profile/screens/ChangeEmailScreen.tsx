import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, TextField } from '../../components';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import { useConfirmEmailChange, useRequestEmailChange } from '../hooks/profile';

const emailSchema = z.string().trim().email();
const codeSchema = z.string().regex(/^\d{6}$/);

/**
 * An admin changes their own email (A3b; plan-ecommerce: admin Account Security). Supabase Auth sends a code to the
 * current address and one to the new address (double_confirm_changes), and changes the email only when both are
 * entered, so someone holding an unlocked phone alone cannot move the account to their own address. The change is
 * audited where it lands, in the database (audit_admin_email_change, BR-15).
 */
export function ChangeEmailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentEmail = useAuthStore(state => state.user?.email ?? '');
  const request = useRequestEmailChange();
  const confirm = useConfirmEmailChange();
  const [newEmail, setNewEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  const send = async () => {
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success || parsed.data.toLowerCase() === currentEmail.toLowerCase()) {
      setFieldError('Enter a different, valid email address');
      return;
    }
    setFieldError(undefined);
    // A refusal is shown from the mutation's own error; here it only stops the step.
    const sent = await request.mutateAsync(parsed.data).then(() => true, () => false);
    if (sent) setSentTo(parsed.data);
  };

  const finish = async () => {
    if (!sentTo) return;
    if (!codeSchema.safeParse(currentCode).success || !codeSchema.safeParse(newCode).success) {
      setFieldError('Enter both 6-digit codes');
      return;
    }
    setFieldError(undefined);
    const changed = await confirm.mutateAsync({ currentEmail, currentCode, newEmail: sentTo, newCode }).then(() => true, () => false);
    if (changed) setDone(true);
  };

  if (done) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Banner tone="success" title="Email changed">{`Sign in with ${sentTo} from now on.`}</Banner>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.text}>{`Current email: ${currentEmail}`}</Text>
      {sentTo === null ? (
        <>
          <TextField
            label="New email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={newEmail}
            onChangeText={setNewEmail}
            error={fieldError}
          />
          {request.error ? <Banner tone="danger">{errorMessage(request.error)}</Banner> : null}
          <Button label="Send codes" loading={request.isPending} onPress={send} />
        </>
      ) : (
        <>
          <Text style={styles.text}>{`We sent a 6-digit code to ${currentEmail} and another to ${sentTo}. Enter both.`}</Text>
          {/* Supabase starts a new session at the first sign-in level when the change lands, so an admin passes the second
              factor again right after (seen on the device in the A3b run). */}
          <Text style={styles.text}>Afterwards you will be asked for your authenticator code again.</Text>
          <TextField
            label={`Code sent to ${currentEmail}`}
            keyboardType="number-pad"
            maxLength={6}
            value={currentCode}
            onChangeText={text => setCurrentCode(text.replace(/\D/g, ''))}
          />
          <TextField
            label={`Code sent to ${sentTo}`}
            keyboardType="number-pad"
            maxLength={6}
            value={newCode}
            onChangeText={text => setNewCode(text.replace(/\D/g, ''))}
            error={fieldError}
          />
          {confirm.error ? <Banner tone="danger">{errorMessage(confirm.error)}</Banner> : null}
          <Button label="Change email" loading={confirm.isPending} onPress={finish} />
          <Button label="Use a different address" variant="quiet" onPress={() => setSentTo(null)} />
        </>
      )}
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    content: { padding: space[4], gap: space[3] },
    text: { ...typography.body, color: colors.ink2 },
  });
}
