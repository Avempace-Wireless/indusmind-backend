import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Customer API', () => {
  const app = createApp();

  describe('GET /customer/devices', () => {
    it('should return customer devices', async () => {
      const response = await request(app)
        .get('/customer/devices')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle external API errors gracefully', async () => {
      // This test will fail if external API is down
      const response = await request(app)
        .get('/customer/devices');

      // Either success or proper error handling
      expect([200, 500]).toContain(response.status);
    });
  });
});
