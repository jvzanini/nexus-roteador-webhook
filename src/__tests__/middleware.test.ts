// Mock transitive dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));
jest.mock('@/lib/rate-limit', () => ({
  checkLoginRateLimit: jest.fn(),
}));

import { isPublicRoute } from '@/lib/auth-helpers';

describe('isPublicRoute', () => {
  it('marca /login como público', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('marca /forgot-password como público', () => {
    expect(isPublicRoute('/forgot-password')).toBe(true);
  });

  it('marca /api/webhook/* como público', () => {
    expect(isPublicRoute('/api/webhook/V1StGXR8_Z5jdHi6B-myT')).toBe(true);
  });

  it('marca /api/auth/* como público', () => {
    expect(isPublicRoute('/api/auth/callback/credentials')).toBe(true);
    expect(isPublicRoute('/api/auth/csrf')).toBe(true);
    expect(isPublicRoute('/api/auth/signin')).toBe(true);
  });

  it('marca /api/health como público', () => {
    expect(isPublicRoute('/api/health')).toBe(true);
  });

  it('bloqueia /dashboard como protegido', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('bloqueia /companies como protegido', () => {
    expect(isPublicRoute('/companies')).toBe(false);
  });

  it('bloqueia /users como protegido', () => {
    expect(isPublicRoute('/users')).toBe(false);
  });

  it('bloqueia /api/companies como protegido', () => {
    expect(isPublicRoute('/api/companies')).toBe(false);
  });

  it('bloqueia / (raiz) como protegido', () => {
    expect(isPublicRoute('/')).toBe(false);
  });
});
