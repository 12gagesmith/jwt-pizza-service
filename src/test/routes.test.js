const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database.js');
const jwt = require('jsonwebtoken');

jest.mock('../database/database.js');
jest.mock('jsonwebtoken');

describe('Route Tests', () => {
  const mockAdmin = { id: 1, name: 'Admin', email: 'a@test.com', roles: [{ role: Role.Admin }] };
  const mockUser = { id: 2, name: 'Diner', email: 'd@test.com', roles: [{ role: Role.Diner }] };
  const mockFranchisee = { id: 3, name: 'Franchisee', email: 'f@test.com', roles: [{ role: Role.Franchisee, objectId: 1 }] };
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: valid token signature
    DB.isLoggedIn.mockResolvedValue(true);
    // Default: jwt decode returns admin
    jwt.verify.mockReturnValue(mockAdmin);
  });

  // --- Auth Router Edge Cases ---
  test('unauthorized if token invalid', async () => {
    DB.isLoggedIn.mockResolvedValue(false);
    const res = await request(app).get('/api/user/me').set('Authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });

  test('PUT /api/user/:userId updates user (admin)', async () => {
    DB.updateUser.mockResolvedValue({ ...mockUser, name: 'New Name' });
    const res = await request(app).put('/api/user/2').send({ name: 'New Name' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');
  });

  test('PUT /api/user/:userId fails for other user', async () => {
    jwt.verify.mockReturnValue(mockUser); // Authenticated as User 2
    const res = await request(app).put('/api/user/99').send({ name: 'Hack' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  // --- Order Router ---
  test('GET /api/order/menu', async () => {
    DB.getMenu.mockResolvedValue([{ title: 'Pizza' }]);
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('PUT /api/order/menu adds item (admin)', async () => {
    DB.addMenuItem.mockResolvedValue({ id: 1 });
    DB.getMenu.mockResolvedValue([]);
    const res = await request(app).put('/api/order/menu').send({ title: 'New' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  test('PUT /api/order/menu fails for non-admin', async () => {
    jwt.verify.mockReturnValue(mockUser);
    const res = await request(app).put('/api/order/menu').send({ title: 'New' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  test('POST /api/order creates order and calls factory', async () => {
    jwt.verify.mockReturnValue(mockUser);
    DB.addDinerOrder.mockResolvedValue({ id: 100 });
    
    // Mock global fetch for factory
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ reportUrl: 'http://factory/report', jwt: '123' }),
      })
    );

    const res = await request(app)
      .post('/api/order')
      .send({ franchiseId: 1, storeId: 1, items: [] })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(100);
    expect(global.fetch).toHaveBeenCalled();
  });

  test('POST /api/order handles factory failure', async () => {
    jwt.verify.mockReturnValue(mockUser);
    DB.addDinerOrder.mockResolvedValue({ id: 100 });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ reportUrl: 'err' }),
      })
    );

    const res = await request(app)
      .post('/api/order')
      .send({ franchiseId: 1, storeId: 1, items: [] })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Failed to fulfill');
  });

  // --- Franchise Router ---
  test('GET /api/franchise lists franchises', async () => {
    DB.getFranchises.mockResolvedValue([[{ id: 1, name: 'P' }], false]);
    const res = await request(app).get('/api/franchise');
    expect(res.status).toBe(200);
    expect(res.body.franchises).toHaveLength(1);
  });

  test('GET /api/franchise/:userId lists user franchises', async () => {
    DB.getUserFranchises.mockResolvedValue([{ id: 1 }]);
    const res = await request(app).get('/api/franchise/1').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  test('POST /api/franchise creates franchise (admin)', async () => {
    DB.createFranchise.mockResolvedValue({ id: 1 });
    const res = await request(app).post('/api/franchise').send({ name: 'F' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  test('POST /api/franchise fails for non-admin', async () => {
    jwt.verify.mockReturnValue(mockUser);
    const res = await request(app).post('/api/franchise').send({ name: 'F' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  test('POST /api/franchise/:id/store creates store (franchisee)', async () => {
    jwt.verify.mockReturnValue(mockFranchisee); // Franchisee for objectId 1
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [{ id: 3 }] });
    DB.createStore.mockResolvedValue({ id: 99 });
    
    const res = await request(app).post('/api/franchise/1/store').send({ name: 'S' }).set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  test('DELETE /api/franchise/:id/store/:storeId deletes store', async () => {
    jwt.verify.mockReturnValue(mockAdmin);
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });
    DB.deleteStore.mockResolvedValue();
    
    const res = await request(app).delete('/api/franchise/1/store/10').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
  
  test('DELETE /api/franchise/:id deletes franchise', async () => {
     DB.deleteFranchise.mockResolvedValue();
     const res = await request(app).delete('/api/franchise/1').set('Authorization', 'Bearer token');
     expect(res.status).toBe(200);
  });

  test('list users unauthorized', async () => {
    const listUsersRes = await request(app).get('/api/user');
    expect(listUsersRes.status).toBe(401);
  });
  
  test('list users', async () => {
    const [user, userToken] = await registerUser(request(app));
    const listUsersRes = await request(app)
      .get('/api/user')
      .set('Authorization', 'Bearer ' + userToken);
    expect(listUsersRes.status).toBe(200);
  });
  
  async function registerUser(service) {
    const testUser = {
      name: 'pizza diner',
      email: `${randomName()}@test.com`,
      password: 'a',
    };
    const registerRes = await service.post('/api/auth').send(testUser);
    registerRes.body.user.password = testUser.password;
  
    return [registerRes.body.user, registerRes.body.token];
  }
  
  function randomName() {
    return Math.random().toString(36).substring(2, 12);
  }
});