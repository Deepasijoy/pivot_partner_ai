import { Router } from 'express';
import { getChatCompletion } from '../services/claudeService';
import { mapErrorToResponse, ValidationError } from '../utils/errors';
import type { ChatRequestBody, ChatResponseBody } from '../types';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const body = req.body as Partial<ChatRequestBody>;
    if (!body || typeof body.message !== 'string' || body.message.trim().length === 0) {
      throw new ValidationError('Request must include a non-empty "message" string.');
    }

    const reply = await getChatCompletion(body.message, body.context);
    const responseBody: ChatResponseBody = { message: reply };
    res.json(responseBody);
  } catch (err) {
    const { status, body: errorBody } = mapErrorToResponse(err);
    if (status >= 500) {
      console.error('[POST /api/chat] failed:', err);
    }
    res.status(status).json(errorBody);
  }
});

export default router;
