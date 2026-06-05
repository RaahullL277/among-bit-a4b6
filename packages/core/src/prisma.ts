import { PrismaClient } from '@prisma/client';

/**
 * A single shared PrismaClient. Both transports (REST API and MCP server) and
 * the service layer use the same instance so connection pooling is centralized.
 */
let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

export type { PrismaClient };
