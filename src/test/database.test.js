const { DB } = require('../database/database.js');

jest.mock('mysql2/promise', () => ({
    createConnection: jest.fn(),
}));

let mockConnection;

beforeEach(() => {
    mockConnection = { end: jest.fn() };
    DB.getConnection = jest.fn().mockResolvedValue(mockConnection);
    DB.query = jest.fn();
    DB.getTokenSignature = jest.fn((token) => token);
});

afterEach(() => {
    jest.clearAllMocks();
  });

test('getMenuTest', async () => {
    const mockConnection = { end: jest.fn() };
    DB.getConnection.mockResolvedValue(mockConnection);
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
    const mockConnection = { end: jest.fn() };
    DB.getConnection.mockResolvedValue(mockConnection);
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
    const mockConnection = { end: jest.fn() };
    DB.getConnection.mockResolvedValue(mockConnection);

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
    const mockConnection = { end: jest.fn() };
    DB.getConnection.mockResolvedValue(mockConnection);

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
    const mockConnection = { end: jest.fn() };
    DB.getConnection.mockResolvedValue(mockConnection);

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