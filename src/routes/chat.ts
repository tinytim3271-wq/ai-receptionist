import { Router } from 'express';
import { endSession, handleCallerMessage, startSession } from '../ai/receptionist';
import { startCall } from '../repositories/calls';

// Local chat simulator: stands in for a real phone call until telephony is wired up.
export const chatRouter = Router();

chatRouter.post('/start', (req, res) => {
  const phoneNumber = String(req.body?.phoneNumber ?? '').trim();
  if (!phoneNumber) {
    res.status(400).json({ message: 'phoneNumber is required' });
    return;
  }
  const call = startCall({
    phoneNumber,
    direction: 'inbound',
    channel: 'chat',
    startedAt: new Date().toISOString(),
    answeredBy: 'ai',
  });
  startSession(call.id, phoneNumber);
  res.status(201).json({
    callId: call.id,
    greeting: `Thanks for calling! This is the virtual assistant. How can I help you today?`,
  });
});

chatRouter.post('/:callId/message', async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) {
    res.status(400).json({ message: 'text is required' });
    return;
  }
  try {
    const result = await handleCallerMessage(req.params.callId, text);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    res.status(500).json({ message });
  }
});

chatRouter.post('/:callId/end', async (req, res) => {
  try {
    await endSession(req.params.callId);
    res.json({ ended: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    res.status(500).json({ message });
  }
});
