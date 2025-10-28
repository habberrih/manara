import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiKey } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async createApiKey(
    organizationId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ record: ApiKey; secret: string }> {
    const secret = this.generateSecret();
    const keyHash = this.hashSecret(secret);

    const record = await this.prisma.apiKey.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        keyHash,
      },
    });

    return { record, secret };
  }

  async listApiKeys(organizationId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async removeApiKey(
    organizationId: string,
    apiKeyId: string,
  ): Promise<ApiKey> {
    const existing = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('API key not found.');
    }

    return this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  private generateSecret(): string {
    const random = randomBytes(32).toString('hex');
    return `manara_${random}`;
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}
