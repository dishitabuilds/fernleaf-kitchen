import type { Request } from 'express';
import type { SessionResponse } from '@fernleaf/contracts';

export interface ApiRequest extends Request {
  requestId: string;
  auth?: {
    sessionId: string;
    token: string;
    response: SessionResponse;
  };
}
