import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

type ValidatedRequest = Omit<Request, 'body' | 'query' | 'params'> & {
  body: unknown;
  query: unknown;
  params: unknown;
};

/**
 * Accepts either a composite schema ({ body, query, params }) or a plain
 * ZodObject, in which case each request part is validated by picking the
 * corresponding key from the object.
 */
export const validate =
  (schema: ZodTypeAny): RequestHandler =>
    (req: Request, res: Response, next: NextFunction): void => {
      try {
        const r = req as ValidatedRequest;
        const hasParts = ['body', 'query', 'params'].some((k) => (schema as unknown as Record<string, unknown>)[k]);
        if (hasParts) {
          const s = schema as unknown as { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };
          if (s.body) r.body = s.body.parse(req.body);
          if (s.query) r.query = s.query.parse(req.query);
          if (s.params) r.params = s.params.parse(req.params);
        } else {
          r.body = schema.parse(req.body);
        }
        next();
      } catch (err) {
        next(err);
      }
    };
