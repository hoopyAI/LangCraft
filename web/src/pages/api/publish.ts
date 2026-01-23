import type { NextApiRequest, NextApiResponse } from 'next';
import { createNotionPage } from '@core/notion';
import { ProcessedArticle } from '@core/types';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const article = req.body as ProcessedArticle;

  if (!article || !article.title || !article.segments) {
    return res.status(400).json({ message: 'Invalid article data' });
  }

  if (!NOTION_TOKEN || !NOTION_PAGE_ID) {
    return res.status(500).json({ message: 'Notion credentials not configured on server' });
  }

  try {
    const url = await createNotionPage(NOTION_TOKEN, NOTION_PAGE_ID, article, false); // Server-side doesn't need proxy
    res.status(200).json({ url });
  } catch (error: any) {
    console.error('Publishing error:', error);
    res.status(500).json({ message: error.message || 'Failed to publish to Notion' });
  }
}
