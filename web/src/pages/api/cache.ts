import type { NextApiRequest, NextApiResponse } from 'next';
import { promises as fs } from 'fs';
import path from 'path';

interface CacheEntry {
  id: string;
  title: string;
  updatedAt?: string;
  sentenceCount?: number;
}

const resolveCacheDir = () => {
  if (process.env.CACHE_DIR) {
    return path.resolve(process.env.CACHE_DIR);
  }
  const projectRoot = path.resolve(process.cwd(), '..');
  return path.join(projectRoot, 'cache');
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cacheDir = resolveCacheDir();

  try {
    const files = await fs.readdir(cacheDir);
    const entries: CacheEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(cacheDir, file);

      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as { title?: string; updatedAt?: string; segments?: unknown[] };
        const id = file.replace(/\.json$/i, '');
        entries.push({
          id,
          title: parsed.title || file.replace(/\.json$/i, ''),
          updatedAt: parsed.updatedAt,
          sentenceCount: Array.isArray(parsed.segments) ? parsed.segments.length : undefined,
        });
      } catch (error) {
        console.warn(`Failed to parse cache file ${file}:`, error);
      }
    }

    entries.sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    return res.status(200).json({ entries });
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === 'ENOENT') {
      return res.status(200).json({ entries: [] });
    }

    console.error('Failed to read cache directory:', error);
    return res.status(500).json({ message: 'Failed to read cache directory' });
  }
}
