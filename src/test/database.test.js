const { DB, Role } = require('../database/database.js');

jest.mock('mysql2/promise', () => ({
    createConnection: jest.fn(),
}));

let mockConnection;

beforeEach(() => {
    mockConnection = { 
        end: jest.fn(),
        execute: jest.fn(), 
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn()
    };
    DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
    DB.query = jest.fn();
    DB.getTokenSignature = jest.fn((token) => token);
});

afterEach(() => {
    jest.clearAllMocks();
});

test('getMenuTest', async () => {
    const mockRows = [
        { id: 1, title: 'Pizza Margherita', description: 'Classic pizza', image: 'margherita.jpg', price: 10 },
        { id: 2, title: 'Pepperoni Pizza', description: 'Spicy pepperoni', image: 'pepperoni.jpg', price: 12 },
    ];
    DB.query.mockResolvedValue(mockRows);

    const result = await DB.getMenu();

    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(mockConnection, 'SELECT * FROM menu');
    expect(result).toEqual(mockRows);
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

test('addMenuItemTest', async () => {
    const mockInsertId = 42;
    DB.query.mockResolvedValue({ insertId: mockInsertId });

    const newItem = {
        title: 'Veggie Pizza',
        description: 'A delicious vegetarian pizza',
        image: 'veggie.jpg',
        price: 15.99,
    };

    const result = await DB.addMenuItem(newItem);

    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(
        mockConnection,
        'INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)',
        [newItem.title, newItem.description, newItem.image, newItem.price]
    );
    expect(result).toEqual({ ...newItem, id: mockInsertId });
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

test('updateUserTest', async () => {
    const userId = 1;
    const name = 'John Doe';
    const email = 'john.doe@example.com';
    const password = 'newpassword123';
    const hashedPassword = 'hashedpassword123';

    jest.spyOn(require('bcrypt'), 'hash').mockResolvedValue(hashedPassword);
    DB.query.mockResolvedValue();
    DB.getUser = jest.fn().mockResolvedValue({ id: userId, name, email });

    const result = await DB.updateUser(userId, name, email, password);

    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(require('bcrypt').hash).toHaveBeenCalledWith(password, 10);
    expect(DB.query).toHaveBeenCalledWith(
        mockConnection,
        `UPDATE user SET password='${hashedPassword}', email='${email}', name='${name}' WHERE id=${userId}`
    );
    expect(DB.getUser).toHaveBeenCalledWith(email, password);
    expect(result).toEqual({ id: userId, name, email });
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

test('isLoggedInTest', async () => {
    const token = 'validToken';
    const userId = 1;

    DB.query.mockResolvedValue([{ userId }]);

    const result = await DB.isLoggedIn(token);

    expect(DB.getTokenSignature).toHaveBeenCalledWith(token);
    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(mockConnection, `SELECT userId FROM auth WHERE token=?`, [token]);
    expect(result).toBe(true);
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

test('logoutUserTest', async () => {
    const token = 'validToken';

    DB.query.mockResolvedValue();

    await DB.logoutUser(token);

    expect(DB.getTokenSignature).toHaveBeenCalledWith(token);
    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(mockConnection, `DELETE FROM auth WHERE token=?`, [token]);
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

test('getOrdersTest', async () => {
    const user = { id: 123 };
    const page = 1;
    const mockOrders = [{ id: 1, franchiseId: 10, storeId: 20, date: '2024-01-01' }];
    const mockItems = [{ id: 50, menuId: 5, description: 'Veggie Pizza', price: 15.99 }];
    
    DB.query.mockResolvedValueOnce(mockOrders).mockResolvedValueOnce(mockItems);

    const result = await DB.getOrders(user, page);

    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenNthCalledWith(1, mockConnection, expect.stringContaining('SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=?'), [user.id]);
    expect(DB.query).toHaveBeenNthCalledWith(2, mockConnection, 'SELECT id, menuId, description, price FROM orderItem WHERE orderId=?', [mockOrders[0].id]);
    expect(result).toEqual({dinerId: user.id, orders: [{ ...mockOrders[0], items: mockItems }], page: page });
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

test('addDinerOrderTest', async () => {
    const user = { id: 123 };
    const order = {
        franchiseId: 1,
        storeId: 1,
        items: [
            { menuId: 10, description: 'Veggie Pizza', price: 15.99 },
            { menuId: 11, description: 'Soda', price: 2.50 }
        ]
    };

    const mockOrderId = 999;
    DB.query.mockResolvedValueOnce({ insertId: mockOrderId });
    DB.getID = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(11);
    DB.query.mockResolvedValue({ insertId: 1 });

    const result = await DB.addDinerOrder(user, order);

    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenNthCalledWith(1, mockConnection, expect.stringContaining('INSERT INTO dinerOrder'), [user.id, order.franchiseId, order.storeId]);
    expect(DB.getID).toHaveBeenNthCalledWith(1, mockConnection, 'id', 10, 'menu');
    expect(DB.query).toHaveBeenLastCalledWith(mockConnection, expect.stringContaining('INSERT INTO orderItem'), [mockOrderId, 11, 'Soda', 2.50]);
    expect(result).toEqual({ ...order, id: mockOrderId });
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
});

// --- New Tests Added ---

test('addUser with Franchisee role', async () => {
    const user = { name: 'F', email: 'f@test.com', password: 'p', roles: [{ role: Role.Franchisee, object: 'pizzaPocket' }] };
    DB.query.mockResolvedValue({ insertId: 1 });
    DB.getID = jest.fn().mockResolvedValue(10); // Franchise ID
    
    // Mock bcrypt
    jest.spyOn(require('bcrypt'), 'hash').mockResolvedValue('hash');

    await DB.addUser(user);
    
    expect(DB.query).toHaveBeenCalledWith(mockConnection, expect.stringContaining('INSERT INTO userRole'), [1, 'franchisee', 10]);
});

test('createFranchise success', async () => {
    const franchise = { name: 'PizzaCorp', admins: [{ email: 'a@test.com' }] };
    
    // Mock admin lookup
    DB.query.mockResolvedValueOnce([{ id: 5, name: 'AdminUser' }]); 
    // Mock franchise insert
    DB.query.mockResolvedValueOnce({ insertId: 50 });
    // Mock role insert
    DB.query.mockResolvedValueOnce({});

    const result = await DB.createFranchise(franchise);

    expect(result.id).toBe(50);
    expect(result.admins[0].id).toBe(5);
});

test('createFranchise fails if admin not found', async () => {
    const franchise = { name: 'PizzaCorp', admins: [{ email: 'unknown@test.com' }] };
    DB.query.mockResolvedValueOnce([]); // No user found
    
    await expect(DB.createFranchise(franchise)).rejects.toThrow('unknown user');
});

test('deleteFranchise transaction success', async () => {
    await DB.deleteFranchise(1);
    
    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(DB.query).toHaveBeenCalledWith(mockConnection, expect.stringContaining('DELETE FROM franchise'), [1]);
});

test('deleteFranchise transaction rollback', async () => {
    DB.query.mockRejectedValue(new Error('DB Error'));
    
    await expect(DB.deleteFranchise(1)).rejects.toThrow('unable to delete franchise');
    expect(mockConnection.rollback).toHaveBeenCalled();
});

test('getFranchises with Admin role', async () => {
    const authUser = { isRole: () => true }; // Admin
    const franchises = [{ id: 1, name: 'F1' }];
    
    // Mock list query
    DB.query.mockResolvedValueOnce(franchises);
    // Mock getFranchise details queries (admins, stores)
    DB.query.mockResolvedValue([]); 

    const result = await DB.getFranchises(authUser);
    expect(result[0]).toEqual(franchises);
});

test('getUserFranchises', async () => {
    // Mock finding franchise IDs for user
    DB.query.mockResolvedValueOnce([{ objectId: 10 }]);
    // Mock finding franchise details
    DB.query.mockResolvedValueOnce([{ id: 10, name: 'F1' }]);
    // Mock getting franchise details internals
    DB.query.mockResolvedValue([]); 
    
    const result = await DB.getUserFranchises(1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('F1');
});

test('createStore', async () => {
    DB.query.mockResolvedValue({ insertId: 99 });
    const result = await DB.createStore(1, { name: 'SLC' });
    expect(result).toEqual({ id: 99, franchiseId: 1, name: 'SLC' });
});

test('deleteStore', async () => {
    DB.query.mockResolvedValue({});
    await DB.deleteStore(1, 10);
    expect(DB.query).toHaveBeenCalledWith(mockConnection, expect.stringContaining('DELETE FROM store'), [1, 10]);
});