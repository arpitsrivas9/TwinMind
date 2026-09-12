import type { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { AppError } from './errorHandler';
import { errorResponse } from '../utils/apiResponse';
import { getOrCreateTrustSession } from '../services/trust/trustSessionService';
import { TrustSessionState } from '../services/trust/trustTypes';

export interface TrustAuthenticatedRequest extends AuthenticatedRequest {
  trustSession?: TrustSessionState;
}

/**
 * Express middleware that enforces TwinTrust™ security policy on sensitive routes.
 * Frontend state is never trusted; authorization is enforced strictly server-side.
 */
export const requireTrustMode = (requiredMode: 'GUEST' | 'OWNER' = 'OWNER') => {
  return async (req: TrustAuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    try {
      const trustSession = await getOrCreateTrustSession(req.user.id, req);
      req.trustSession = trustSession;

      // 1. If system is locked, block access immediately
      if (trustSession.currentMode === 'LOCKED') {
        return res.status(423).json(
          errorResponse('TwinMind is locked. Verification required to access your cognitive system.', {
            code: 'TWINMIND_LOCKED',
            trustState: 'LOCKED',
            trustScore: trustSession.trustScore,
            requiredAction: 'VERIFY_TO_UNLOCK',
          }),
        );
      }

      // 2. If Owner mode is required but current mode is Guest
      if (requiredMode === 'OWNER' && trustSession.currentMode !== 'OWNER') {
        return res.status(403).json(
          errorResponse('Owner verification required for this operation.', {
            code: 'GUEST_MODE_RESTRICTED',
            trustState: trustSession.currentMode,
            trustScore: trustSession.trustScore,
            requiredAction: 'VERIFY_OWNER',
          }),
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
};
