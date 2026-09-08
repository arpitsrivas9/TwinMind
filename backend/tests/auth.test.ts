import request from 'supertest';
import app from '../src/app';

describe('TwinMind auth API', () => {
  it('should reject invalid signup data', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'A',
        email: 'invalid-email',
        password: 'short',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('should allow a valid signup', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Alice Example',
        email: 'alice@example.com',
        password: 'StrongPass123!',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('token');
    expect(response.body.data.user.email).toBe('alice@example.com');
  });

  it('should reject duplicate signup', async () => {
    const first = await request(app).post('/api/auth/signup').send({
      name: 'Alice Duplicate',
      email: 'duplicate@example.com',
      password: 'StrongPass123!',
    });

    expect(first.status).toBe(201);

    const second = await request(app).post('/api/auth/signup').send({
      name: 'Alice Duplicate',
      email: 'duplicate@example.com',
      password: 'StrongPass123!',
    });

    expect(second.status).toBe(409);
  });

  it('should allow login and access protected profile route', async () => {
    await request(app).post('/api/auth/signup').send({
      name: 'Bob Example',
      email: 'bob@example.com',
      password: 'StrongPass123!',
    });

    const loginResponse = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'StrongPass123!',
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);

    const token = loginResponse.body.data.token;

    const profileResponse = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.data.email).toBe('bob@example.com');
  });
});
