import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from 'src/organization/api-keys.service';
import { PrismaService } from 'src/prisma/prisma.service';

const updateMock = jest.fn();
const digestMock = jest.fn();

jest.mock('node:crypto', () => ({
  randomBytes: jest
    .fn()
    .mockReturnValue(
      Buffer.from(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'hex',
      ),
    ),
  createHash: jest.fn(() => ({
    update: updateMock,
    digest: digestMock,
  })),
}));

describe('ApiKeysService (integration-like)', () => {
  let service: ApiKeysService;
  const prismaApiKeyMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const prismaMock = {
    apiKey: prismaApiKeyMock,
  } as unknown as PrismaService;

  beforeEach(async () => {
    updateMock.mockClear();
    digestMock.mockClear();
    updateMock.mockImplementation(() => ({
      update: updateMock,
      digest: digestMock,
    }));
    digestMock.mockImplementation(() => 'hashed-secret');

    Object.values(prismaApiKeyMock).forEach((fn) => fn.mockReset());

    const cryptoMock = jest.requireMock('node:crypto') as {
      randomBytes: jest.Mock;
      createHash: jest.Mock;
    };
    cryptoMock.randomBytes.mockClear();
    cryptoMock.createHash.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(ApiKeysService);
  });

  describe('createApiKey', () => {
    it('persists hashed secret and returns plaintext value once', async () => {
      const createdRecord = {
        id: 'key-1',
        organizationId: 'org-1',
        name: 'Production Key',
        createdAt: new Date('2024-05-01T00:00:00.000Z'),
        updatedAt: new Date('2024-05-01T00:00:00.000Z'),
        deletedAt: null,
        lastUsedAt: null,
        keyHash: 'hashed-secret',
      };
      prismaApiKeyMock.create.mockResolvedValue(createdRecord);

      const result = await service.createApiKey('org-1', {
        name: 'Production Key',
      });

      expect(prismaApiKeyMock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          name: 'Production Key',
          keyHash: 'hashed-secret',
        }),
      });
      expect(updateMock).toHaveBeenCalledWith(
        expect.stringMatching(/^manara_/),
      );
      expect(result).toEqual({
        record: createdRecord,
        secret: expect.stringMatching(/^manara_/),
      });
    });
  });

  describe('listApiKeys', () => {
    it('returns all non-deleted keys ordered by creation', async () => {
      const keys = [{ id: 'key-1' }];
      prismaApiKeyMock.findMany.mockResolvedValue(keys);

      const result = await service.listApiKeys('org-1');

      expect(prismaApiKeyMock.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(keys);
    });
  });

  describe('removeApiKey', () => {
    it('throws NotFound when key missing', async () => {
      prismaApiKeyMock.findFirst.mockResolvedValue(null);

      await expect(service.removeApiKey('org-1', 'key-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets deletedAt timestamp for matching key', async () => {
      prismaApiKeyMock.findFirst.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        deletedAt: null,
      });
      const updated = {
        id: 'key-1',
        deletedAt: new Date(),
      };
      prismaApiKeyMock.update.mockResolvedValue(updated);

      const result = await service.removeApiKey('org-1', 'key-1');

      expect(prismaApiKeyMock.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toBe(updated);
    });
  });
});
