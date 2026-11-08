import { describe, expect, it } from 'vitest';

// Sanity check that the api module parses and exports the expected surface.
import { api, ApiError } from './api';

describe('api client', () => {
  it('exposes expected endpoints', () => {
    expect(typeof api.login).toBe('function');
    expect(typeof api.register).toBe('function');
    expect(typeof api.runAnalysis).toBe('function');
    expect(typeof api.runReview).toBe('function');
    expect(typeof api.analytics).toBe('function');
  });

  it('creates ApiError with status and code', () => {
    const err = new ApiError(404, 'NOT_FOUND', 'missing');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});
