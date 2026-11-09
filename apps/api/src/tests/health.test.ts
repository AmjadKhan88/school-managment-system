import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('API shell', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('validates login payloads', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'bad' });
    expect(res.status).toBe(400);
  });
});
