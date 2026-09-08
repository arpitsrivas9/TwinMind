"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../src/app"));
describe('TwinMind auth API', () => {
    it('should reject invalid signup data', async () => {
        const response = await (0, supertest_1.default)(app_1.default)
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
        const response = await (0, supertest_1.default)(app_1.default)
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
        const first = await (0, supertest_1.default)(app_1.default).post('/api/auth/signup').send({
            name: 'Alice Duplicate',
            email: 'duplicate@example.com',
            password: 'StrongPass123!',
        });
        expect(first.status).toBe(201);
        const second = await (0, supertest_1.default)(app_1.default).post('/api/auth/signup').send({
            name: 'Alice Duplicate',
            email: 'duplicate@example.com',
            password: 'StrongPass123!',
        });
        expect(second.status).toBe(409);
    });
    it('should allow login and access protected profile route', async () => {
        await (0, supertest_1.default)(app_1.default).post('/api/auth/signup').send({
            name: 'Bob Example',
            email: 'bob@example.com',
            password: 'StrongPass123!',
        });
        const loginResponse = await (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({
            email: 'bob@example.com',
            password: 'StrongPass123!',
        });
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body.success).toBe(true);
        const token = loginResponse.body.data.token;
        const profileResponse = await (0, supertest_1.default)(app_1.default)
            .get('/api/users/me')
            .set('Authorization', `Bearer ${token}`);
        expect(profileResponse.status).toBe(200);
        expect(profileResponse.body.success).toBe(true);
        expect(profileResponse.body.data.email).toBe('bob@example.com');
    });
});
