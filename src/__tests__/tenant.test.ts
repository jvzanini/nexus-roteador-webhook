const mockPrisma = {
  userCompanyMembership: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  getAccessibleCompanyIds,
  buildTenantFilter,
  assertCompanyAccess,
} from '@/lib/tenant';

describe('getAccessibleCompanyIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna undefined para super_admin (acesso total)', async () => {
    const result = await getAccessibleCompanyIds({
      id: 'admin-id',
      isSuperAdmin: true,
    });
    expect(result).toBeUndefined();
    expect(mockPrisma.userCompanyMembership.findMany).not.toHaveBeenCalled();
  });

  it('retorna lista de company IDs para usuário normal', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'company-1' },
      { companyId: 'company-2' },
    ]);

    const result = await getAccessibleCompanyIds({
      id: 'user-id',
      isSuperAdmin: false,
    });
    expect(result).toEqual(['company-1', 'company-2']);
    expect(mockPrisma.userCompanyMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', isActive: true },
      select: { companyId: true },
    });
  });

  it('retorna array vazio para usuário sem memberships', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([]);

    const result = await getAccessibleCompanyIds({
      id: 'lonely-user',
      isSuperAdmin: false,
    });
    expect(result).toEqual([]);
  });
});

describe('buildTenantFilter', () => {
  it('retorna filtro vazio para super_admin (undefined companyIds)', () => {
    const filter = buildTenantFilter(undefined);
    expect(filter).toEqual({});
  });

  it('retorna filtro IN para lista de company IDs', () => {
    const filter = buildTenantFilter(['c1', 'c2']);
    expect(filter).toEqual({ companyId: { in: ['c1', 'c2'] } });
  });

  it('retorna filtro impossível para array vazio', () => {
    const filter = buildTenantFilter([]);
    expect(filter).toEqual({ companyId: { in: [] } });
  });
});

describe('assertCompanyAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permite acesso para super_admin sem consultar banco', async () => {
    await expect(
      assertCompanyAccess(
        { id: 'admin', isSuperAdmin: true },
        'any-company'
      )
    ).resolves.not.toThrow();
  });

  it('permite acesso quando usuário tem membership ativa', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'target-company' },
      { companyId: 'other-company' },
    ]);

    await expect(
      assertCompanyAccess(
        { id: 'user', isSuperAdmin: false },
        'target-company'
      )
    ).resolves.not.toThrow();
  });

  it('lanca erro quando usuário não tem membership', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'other-company' },
    ]);

    await expect(
      assertCompanyAccess(
        { id: 'user', isSuperAdmin: false },
        'forbidden-company'
      )
    ).rejects.toThrow('Acesso negado');
  });
});
