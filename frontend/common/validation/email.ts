// Zod rule and message for email fields on the auth forms.
import { z } from 'zod';

/** Shown under an email field while what is typed is not yet a valid address. */
export const EMAIL_MESSAGE = 'Enter a valid email address, like name@gmail.com';

/** An email address on every auth form: any valid address (D20), checked as it is typed. */
export const emailSchema = z.string().trim().min(1, 'Enter your email').email(EMAIL_MESSAGE);
