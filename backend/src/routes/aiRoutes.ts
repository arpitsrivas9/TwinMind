import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { successResponse } from '../utils/apiResponse';
import { getConfiguredModels } from '../services/modelRegistry';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/models', requireAuth, (_req, res) => {
  return res.status(200).json(
    successResponse(
      getConfiguredModels().map(({ id, provider, displayName, supportsStreaming }) => ({
        id,
        provider,
        displayName,
        supportsStreaming,
      })),
    ),
  );
});

router.use((_req: AuthenticatedRequest, _res, next) => next(new AppError('AI route not found', 404)));

export default router;
