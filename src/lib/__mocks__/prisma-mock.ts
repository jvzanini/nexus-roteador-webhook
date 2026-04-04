/**
 * Prisma mock helper for unit tests.
 * Creates a deeply mocked PrismaClient with all models as jest mock functions.
 */

const createMockModel = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  groupBy: jest.fn(),
});

export const prismaMock = {
  auditLog: createMockModel(),
  user: createMockModel(),
  company: createMockModel(),
  companyCredential: createMockModel(),
  userCompanyMembership: createMockModel(),
  inboundWebhook: createMockModel(),
  routeDelivery: createMockModel(),
  deliveryAttempt: createMockModel(),
  webhookRoute: createMockModel(),
  globalSettings: createMockModel(),
  notification: createMockModel(),
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};
