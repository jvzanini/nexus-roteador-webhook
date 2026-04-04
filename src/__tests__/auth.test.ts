import bcrypt from 'bcryptjs';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock rate limiter
const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  checkLoginRateLimit: mockCheckRateLimit,
}));

// Importamos o authorize depois dos mocks
import { authorizeCredentials } from '@/lib/auth-helpers';

describe('authorizeCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
  });

  it('retorna null para credenciais inválidas (email vazio)', async () => {
    const result = await authorizeCredentials(
      { email: '', password: 'any' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna null para senha vazia', async () => {
    const result = await authorizeCredentials(
      { email: 'test@test.com', password: '' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna null quando usuário não existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authorizeCredentials(
      { email: 'notfound@test.com', password: 'password123' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'notfound@test.com' },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        isSuperAdmin: true,
        isActive: true,
        avatarUrl: true,
        theme: true,
      },
    });
  });

  it('retorna null quando usuário está inativo', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'inactive@test.com',
      name: 'Inactive',
      password: await bcrypt.hash('password123', 12),
      isSuperAdmin: false,
      isActive: false,
      avatarUrl: null,
      theme: 'dark',
    });

    const result = await authorizeCredentials(
      { email: 'inactive@test.com', password: 'password123' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna null quando senha está incorreta', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'user@test.com',
      name: 'User',
      password: await bcrypt.hash('correct-password', 12),
      isSuperAdmin: false,
      isActive: true,
      avatarUrl: null,
      theme: 'dark',
    });

    const result = await authorizeCredentials(
      { email: 'user@test.com', password: 'wrong-password' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna user quando credenciais são válidas', async () => {
    const hashedPassword = await bcrypt.hash('correct-password', 12);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uuid-123',
      email: 'admin@test.com',
      name: 'Admin',
      password: hashedPassword,
      isSuperAdmin: true,
      isActive: true,
      avatarUrl: 'https://example.com/avatar.png',
      theme: 'dark',
    });

    const result = await authorizeCredentials(
      { email: 'admin@test.com', password: 'correct-password' },
      '127.0.0.1'
    );

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'admin@test.com',
      name: 'Admin',
      isSuperAdmin: true,
      avatarUrl: 'https://example.com/avatar.png',
      theme: 'dark',
    });
  });

  it('rejeita quando rate limit é excedido', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    await expect(
      authorizeCredentials(
        { email: 'user@test.com', password: 'any' },
        '127.0.0.1'
      )
    ).rejects.toThrow('Muitas tentativas de login');
  });
});
