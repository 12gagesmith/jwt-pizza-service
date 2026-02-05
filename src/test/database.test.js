const { DB } = require('../database/database.js');

jest.mock('mysql2/promise', () => ({
    createConnection: jest.fn(),
}));

beforeEach(() => {
    DB.getConnection = jest.fn();
    DB.query = jest.fn();
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
