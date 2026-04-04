import bcrypt from 'bcryptjs';

// Mock completo do fluxo
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  userCompanyMembership: {
    findMany: jest.fn(),
  },
};

const mockRedis = {
  multi: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
};

const mockMultiExec = {
  incr: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

mockRedis.multi.mockReturnValue(mockMultiExec);

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/redis', () => ({ redis: mockRedis }));

import { authorizeCredentials } from '@/lib/auth-helpers';
import { getAccessibleCompanyIds, buildTenantFilter } from '@/lib/tenant';

describe('Auth + Tenant Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 1], [null, 'OK']]);
  });

  it('fluxo completo: login -> tenant scoping', async () => {
    const hashedPassword = await bcrypt.hash('password123', 12);

    // 1. Login bem-sucedido
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'manager@company.com',
      name: 'Manager',
      password: hashedPassword,
      isSuperAdmin: false,
      isActive: true,
      avatarUrl: null,
      theme: 'dark',
    });

    const user = await authorizeCredentials(
      { email: 'manager@company.com', password: 'password123' },
      '127.0.0.1'
    );

    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-1');
    expect(user!.isSuperAdmin).toBe(false);

    // 2. Obter companies acessíveis
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'company-a' },
      { companyId: 'company-b' },
    ]);

    const companyIds = await getAccessibleCompanyIds({
      id: user!.id,
      isSuperAdmin: user!.isSuperAdmin,
    });

    expect(companyIds).toEqual(['company-a', 'company-b']);

    // 3. Construir filtro de tenant
    const filter = buildTenantFilter(companyIds);
    expect(filter).toEqual({
      companyId: { in: ['company-a', 'company-b'] },
    });
  });

  it('super admin bypassa tenant scoping', async () => {
    const hashedPassword = await bcrypt.hash('admin-pass', 12);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@nexusai360.com',
      name: 'Super Admin',
      password: hashedPassword,
      isSuperAdmin: true,
      isActive: true,
      avatarUrl: null,
      theme: 'dark',
    });

    const user = await authorizeCredentials(
      { email: 'admin@nexusai360.com', password: 'admin-pass' },
      '127.0.0.1'
    );

    expect(user!.isSuperAdmin).toBe(true);

    const companyIds = await getAccessibleCompanyIds({
      id: user!.id,
      isSuperAdmin: user!.isSuperAdmin,
    });

    expect(companyIds).toBeUndefined();

    const filter = buildTenantFilter(companyIds);
    expect(filter).toEqual({}); // Sem filtro
  });

  it('rate limit bloqueia apos 5 tentativas', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 5], [null, 'OK']]);
    mockRedis.set.mockResolvedValue('OK');

    await expect(
      authorizeCredentials(
        { email: 'victim@test.com', password: 'wrong' },
        '192.168.1.1'
      )
    ).rejects.toThrow('Muitas tentativas de login');
  });
});
