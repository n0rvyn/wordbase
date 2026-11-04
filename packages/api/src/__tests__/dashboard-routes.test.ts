import { describe,it,expect,beforeAll,vi,afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { app } from '../app.js';
import { registerTools } from '../mcp/tools.js';
const readKey='wb-observation-fixture';const deniedKey='wb-posts-fixture';
beforeAll(async()=>{
 for(const [id,key,permissions] of [['obs',readKey,['observability:read','comments:read']],['posts',deniedKey,['posts:read']]] as const)
  await db.insert(apiKeys).values({id,name:'isolated test',keyPrefix:key.slice(0,8),keyHash:await bcrypt.hash(key,4),permissions:JSON.stringify(permissions),createdAt:1});
});
afterEach(()=>vi.useRealTimers());
const headers={Authorization:`Bearer ${readKey}`};
describe('dashboard routes and MCP',()=>{
 it('timestamps the public content snapshot without changing its read permission',async()=>{
  const response=await app.request('/api/posts?limit=5');expect(response.status).toBe(200);
  const metadata=JSON.parse(response.headers.get('X-Wordbase-Observation')!);expect(metadata.source).toContain('SQLite content');expect(metadata.range).toBe('Current database snapshot');
 });
 it('guards global comment counts with comments:read and keeps raw data out of anonymous responses',async()=>{
  expect((await app.request('/api/comments/counts')).status).toBe(401);
  expect((await app.request('/api/comments/counts',{headers:{Authorization:`Bearer ${deniedKey}`}})).status).toBe(403);
  const allowed=await app.request('/api/comments/counts',{headers});expect(allowed.status).toBe(200);expect(await allowed.json()).toEqual({pending:0,total:0});
  expect(JSON.parse(allowed.headers.get('X-Wordbase-Observation')!).definition).toContain('not limited to recent posts');
 });
 it('gives REST and MCP identical data, range, timestamp and definition for a selected ranking window',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
  const response=await app.request('/api/observability/top-pages?days=84&limit=10',{headers});expect(response.status).toBe(200);
  const handlers=new Map<string,any>();registerTools({tool:(name:string,_description:unknown,_schema:unknown,handler:unknown)=>handlers.set(name,handler)},['observability:read']);
  const result=await handlers.get('observability_query')({section:'top-pages',days:84,limit:10});
  expect(JSON.parse(result.content[0].text)).toEqual(await response.json());
  expect(JSON.parse(result.content[1].text).observation).toEqual(JSON.parse(response.headers.get('X-Wordbase-Observation')!));
  expect(handlers.has('post_delete')).toBe(false);
 });
 it('supports weekly and monthly trend buckets through MCP without expanding its permission scope',async()=>{
  const handlers=new Map<string,any>();registerTools({tool:(name:string,_description:unknown,_schema:unknown,handler:unknown)=>handlers.set(name,handler)},['observability:read']);
  const result=await handlers.get('observability_query')({section:'trends',period:'weekly'});
  const rows=JSON.parse(result.content[0].text);expect(rows.every((r:{period:string})=>/W\d\d$/.test(r.period))).toBe(true);
  expect(JSON.parse(result.content[1].text).observation.definition).toContain('not whole-site sessions');
 });
});
