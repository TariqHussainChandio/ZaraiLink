import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, CodeField, ScreenScaffold, TextField } from '../../components';
import { formatCountdown, isSendRateLimited, mapAuthErrorMessage, useResendCooldown } from '../../auth';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import { EmailCodeError, useConfirmEmailChange, useRequestEmailChange } from '../hooks/profile';

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
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  // One message per code field: the error shows under the field it is about, never under the other.
  const [currentCodeError, setCurrentCodeError] = useState<string | undefined>(undefined);
  const [newCodeError, setNewCodeError] = useState<string | undefined>(undefined);
  const [currentAccepted, setCurrentAccepted] = useState(false);
  const [resendResult, setResendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const { remaining, restart } = useResendCooldown();

  const send = async () => {
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success || parsed.data.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailError('Enter a different, valid email address');
      return;
    }
    setEmailError(undefined);
    // A refusal is shown from the mutation's own error; here it only stops the step.
    const sent = await request.mutateAsync(parsed.data).then(() => true, () => false);
    if (sent) {
      setSentTo(parsed.data);
      restart();
    }
  };

  const resend = async () => {
    if (!sentTo) return;
    setResendResult(null);
    try {
      await request.mutateAsync(sentTo);
      restart();
      setCurrentCode('');
      setNewCode('');
      setCurrentAccepted(false);
      setResendResult({ ok: true, text: 'New codes sent. The old ones no longer work.' });
    } catch (error) {
      setResendResult({
        ok: false,
        text: isSendRateLimited(error) ? 'Codes were sent a moment ago. Check your email, or wait to ask again.' : mapAuthErrorMessage(error, 'Could not send new codes. Try again.'),
      });
    }
  };

  const finish = async () => {
    if (!sentTo) return;
    const currentOk = currentAccepted || codeSchema.safeParse(currentCode).success;
    const newOk = codeSchema.safeParse(newCode).success;
    setCurrentCodeError(currentOk ? undefined : 'Enter the 6-digit code');
    setNewCodeError(newOk ? undefined : 'Enter the 6-digit code');
    if (!currentOk || !newOk) return;
    try {
      await confirm.mutateAsync({ currentEmail, currentCode, newEmail: sentTo, newCode, skipCurrent: currentAccepted });
      setDone(true);
    } catch (error) {
      if (error instanceof EmailCodeError) {
        const text = mapAuthErrorMessage(error.original, 'That code did not work. Check it, or ask for new codes.');
        if (error.which === 'current') {
          setCurrentCodeError(text);
          setNewCodeError(undefined);
        } else {
          // The first code was accepted: it is spent, so a retry sends only the second.
          setCurrentAccepted(true);
          setCurrentCodeError(undefined);
          setNewCodeError(text);
        }
        return;
      }
      setNewCodeError(errorMessage(error));
    }
  };

  if (done) {
    return (
      <ScreenScaffold>
        <Banner tone="success" title="Email changed">{`Sign in with ${sentTo} from now on.`}</Banner>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold>
      <Text style={styles.text}>{`Current email: ${currentEmail}`}</Text>
      {sentTo === null ? (
        <>
          <TextField
            label="New email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={send}
            value={newEmail}
            onChangeText={setNewEmail}
            error={emailError}
          />
          {request.error ? <Banner tone="danger" title="Couldn't send the codes">{errorMessage(request.error)}</Banner> : null}
          <Button label="Send codes" size="lg" loading={request.isPending} onPress={send} />
        </>
      ) : (
        <>
          <Text style={styles.text}>{`A 6-digit code was sent to ${currentEmail} and another to ${sentTo}. Enter both.`}</Text>
          {/* Supabase starts a new session at the first sign-in level when the change lands, so an admin passes the second
              factor again right after (seen on the device in the A3b run). */}
          <Text style={styles.text}>Afterwards you will be asked for your authenticator code again.</Text>
          <View>
            <CodeField
              label={`Code sent to ${currentEmail}`}
              value={currentCode}
              onChange={value => {
                setCurrentCode(value);
                setCurrentCodeError(undefined);
              }}
              error={currentCodeError}
            />
            <CodeField
              label={`Code sent to ${sentTo}`}
              value={newCode}
              onChange={value => {
                setNewCode(value);
                setNewCodeError(undefined);
              }}
              error={newCodeError}
            />
            <Text style={styles.helper}>Check your spam folder. The codes work for 15 minutes.</Text>
          </View>
          <Button label="Change email" size="lg" loading={confirm.isPending} onPress={finish} />
          <View style={styles.resend}>
            {remaining > 0 ? (
              <Text style={styles.text}>{`Send new codes in ${formatCountdown(remaining)}`}</Text>
            ) : (
              <Button label="Send new codes" variant="secondary" fullWidth={false} loading={request.isPending} onPress={resend} />
            )}
            {resendResult ? (
              <Text style={[styles.result, resendResult.ok ? styles.ok : styles.fail]} accessibilityLiveRegion="polite">
                {resendResult.text}
              </Text>
            ) : null}
          </View>
          <Button label="Use a different address" variant="quiet" fullWidth={false} onPress={() => setSentTo(null)} />
        </>
      )}
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    text: { ...typography.body, color: colors.ink2 },
    helper: { ...typography.caption, color: colors.ink3 },
    resend: { gap: space[2], alignItems: 'flex-start' },
    result: { ...typography.caption },
    ok: { color: colors.status.success.ink },
    fail: { color: colors.status.danger.ink },
  });
}
