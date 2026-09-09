import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../middleware/errorHandler';

export interface IStorageProvider {
  saveFile(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  fileExists(key: string): Promise<boolean>;
}

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir = env.storageLocalDir) {
    this.baseDir = path.resolve(process.cwd(), baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(key: string): string {
    const safeKey = key.replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.baseDir, safeKey);

    if (!fullPath.startsWith(this.baseDir)) {
      throw new AppError('Invalid storage key: path traversal detected', 400);
    }
    return fullPath;
  }

  async saveFile(key: string, buffer: Buffer): Promise<string> {
    const fullPath = this.resolveSafePath(key);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, buffer);
    logger.info('File saved to storage', { key, size: buffer.length });
    return key;
  }

  async getFile(key: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(key);
    if (!fs.existsSync(fullPath)) {
      throw new AppError('Requested file not found in storage', 404);
    }
    return fs.promises.readFile(fullPath);
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      logger.info('File deleted from storage', { key });
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(key);
    return fs.existsSync(fullPath);
  }
}

let activeStorageProvider: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (!activeStorageProvider) {
    activeStorageProvider = new LocalStorageProvider();
  }
  return activeStorageProvider;
}

export function setStorageProvider(provider: IStorageProvider) {
  activeStorageProvider = provider;
}

