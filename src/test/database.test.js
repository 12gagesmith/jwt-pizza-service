const { DB } = require('../database/database.js'); // Adjust the path as needed

jest.mock('mysql2/promise', () => ({
  createConnection: jest.fn(),
}));

describe('DB.getMenu', () => {
  beforeEach(() => {
    DB.getConnection = jest.fn();
    DB.query = jest.fn();
  });

  it('should fetch all menu items from the database', async () => {
    // Mock connection and query
    const mockConnection = { end: jest.fn() };
    DB.getConnection.mockResolvedValue(mockConnection);
    const mockRows = [
      { id: 1, title: 'Pizza Margherita', description: 'Classic pizza', image: 'margherita.jpg', price: 10 },
      { id: 2, title: 'Pepperoni Pizza', description: 'Spicy pepperoni', image: 'pepperoni.jpg', price: 12 },
    ];
    DB.query.mockResolvedValue(mockRows);

    // Call the method
    const result = await DB.getMenu();

    // Assertions
    expect(DB.getConnection).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(mockConnection, 'SELECT * FROM menu');
    expect(result).toEqual(mockRows);
    expect(mockConnection.end).toHaveBeenCalledTimes(1);
  });
});