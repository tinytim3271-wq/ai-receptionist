/**
 * Decide what to do when a telephony AI turn times out or fails.
 *
 * Tools may already have committed side effects (appointment booked, escalation,
 * or callback created) before a later AI round aborts. Overwriting those
 * dispositions and creating a duplicate high-priority callback corrupts call
 * state and confuses advisors.
 */
export type TelephonyFallbackPlan = {
  overwriteDisposition: boolean;
  createCallback: boolean;
  message: string;
  logAction: string;
  preservedDisposition: string | null;
};

const FALLBACK_MESSAGE =
  'I am having trouble completing that right now. A service advisor will call you back shortly to help.';

export function planTelephonyAiFallback(
  disposition: string | null | undefined
): TelephonyFallbackPlan {
  const current = disposition ?? null;

  if (current === 'booked') {
    return {
      overwriteDisposition: false,
      createCallback: false,
      message:
        'Your appointment is booked. If you need anything else, please stay on the line or a service advisor can follow up.',
      logAction: 'Preserved booked disposition; skipped fallback callback',
      preservedDisposition: current,
    };
  }

  if (current === 'escalated') {
    return {
      overwriteDisposition: false,
      createCallback: false,
      message:
        'I have already alerted our team about your situation. A service advisor will follow up shortly.',
      logAction: 'Preserved escalated disposition; skipped fallback callback',
      preservedDisposition: current,
    };
  }

  if (current === 'callback_scheduled') {
    return {
      overwriteDisposition: false,
      createCallback: false,
      message: FALLBACK_MESSAGE,
      logAction: 'Preserved existing callback; skipped duplicate fallback callback',
      preservedDisposition: current,
    };
  }

  return {
    overwriteDisposition: true,
    createCallback: true,
    message: FALLBACK_MESSAGE,
    logAction: 'Created callback task and used fallback caller response',
    preservedDisposition: null,
  };
}
