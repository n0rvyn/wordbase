import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as categoryService from '../services/category.service.js';
import type { AppEnv } from '../types.js';

export const categoriesRouter = new Hono<AppEnv>();

categoriesRouter.get('/', async (c) => {
  const categories = await categoryService.listCategories();
  return c.json(categories);
});

categoriesRouter.get('/:idOrSlug', async (c) => {
  const category = await categoryService.getCategory(c.req.param('idOrSlug'));
  if (!category) return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404);
  return c.json(category);
});

categoriesRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const category = await categoryService.createCategory(body);
  return c.json(category, 201);
});

categoriesRouter.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  const category = await categoryService.updateCategory(c.req.param('id'), body);
  if (!category) return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404);
  return c.json(category);
});

categoriesRouter.delete('/:id', authMiddleware, async (c) => {
  const category = await categoryService.deleteCategory(c.req.param('id'));
  if (!category) return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404);
  return c.json({ success: true });
});
