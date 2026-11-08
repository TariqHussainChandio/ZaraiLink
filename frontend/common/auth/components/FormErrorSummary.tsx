import type { FieldErrors, FieldValues } from 'react-hook-form';
import React from 'react';
import { Banner } from '../../components';

/** Every message in a form's errors, once each, in field order (nested objects such as an address included). */
export function collectErrorMessages(errors: FieldErrors<FieldValues>): string[] {
  const messages: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) messages.push(record.message);
    for (const [key, child] of Object.entries(record)) {
      // `ref` is the field's input; `message` and `type` are plain values.
      if (key !== 'ref' && key !== 'types') walk(child);
    }
  };
  walk(errors);
  return [...new Set(messages)];
}

export interface FormErrorSummaryProps {
  /** The form's `errors`. */
  errors: FieldErrors<FieldValues>;
  /** Shown only after the person pressed the button once: a fresh form does not open already scolding. */
  submitted: boolean;
  /** Extra messages from outside the form's own rules (a chip group kept in state). */
  extra?: (string | undefined)[];
}

/** What stops the form from being sent, in one place above the button. On a long form the field that is wrong can be
 * screens above the button; this says so where the finger is, and the first wrong field is focused as well. */
export function FormErrorSummary({ errors, submitted, extra = [] }: FormErrorSummaryProps) {
  const messages = [...new Set([...collectErrorMessages(errors), ...extra.filter((m): m is string => !!m)])];
  if (!submitted || messages.length === 0) return null;
  return (
    <Banner tone="danger" title={messages.length === 1 ? 'Fix this to continue' : `Fix these ${messages.length} things to continue`}>
      {messages.join('\n')}
    </Banner>
  );
}
