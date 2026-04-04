// Mock Redis
const mockRedis = {
  multi: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockMultiExec = {
  incr: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

mockRedis.multi.mockReturnValue(mockMultiExec);

jest.mock('@/lib/redis', () => ({
  redis: mockRedis,
}));

import { checkLoginRateLimit } from '@/lib/rate-limit';

describe('checkLoginRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.multi.mockReturnValue(mockMultiExec);
  });

  it('permite login quando não há tentativas anteriores', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 1], [null, 'OK']]);

    const result = await checkLoginRateLimit('user@test.com', '127.0.0.1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('permite login quando há menos de 5 tentativas', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 3], [null, 'OK']]);

    const result = await checkLoginRateLimit('user@test.com', '192.168.1.1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('bloqueia quando atinge 5 tentativas', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 5], [null, 'OK']]);

    const result = await checkLoginRateLimit('user@test.com', '127.0.0.1');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('bloqueia quando há bloqueio ativo (lockout key)', async () => {
    mockRedis.get.mockResolvedValue('1');
    mockRedis.ttl.mockResolvedValue(600);

    const result = await checkLoginRateLimit('user@test.com', '127.0.0.1');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(600);
  });

  it('usa chave composta email+IP', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 1], [null, 'OK']]);

    await checkLoginRateLimit('user@test.com', '10.0.0.1');

    expect(mockRedis.get).toHaveBeenCalledWith(
      'login:lockout:user@test.com:10.0.0.1'
    );
  });
});
