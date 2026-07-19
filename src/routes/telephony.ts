import { Router } from 'express';

/**
 * Extension point for a real phone number later.
 *
 * To go live with real calls, sign up with a telephony provider (Twilio, Telnyx,
 * Vonage, or a SIP trunk) and point its inbound-call webhook at this route.
 * The provider handles the phone line and speech-to-text/text-to-speech; each
 * transcribed caller utterance should be passed to handleCallerMessage() in
 * src/ai/receptionist.ts (same engine the local chat UI uses), and the reply
 * text returned to the provider for speech playback. Nothing in the core
 * engine needs to change.
 */
export const telephonyRouter = Router();

telephonyRouter.post('/twilio/voice', (_req, res) => {
  res.status(501).json({
    message:
      'Telephony is not configured. This local build handles calls through the chat simulator at /. See src/routes/telephony.ts for how to connect a phone provider later.',
  });
});
