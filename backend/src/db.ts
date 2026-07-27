// A single shared Prisma client for the whole app.
// (Creating many clients would open too many DB connections.)
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
