import { describe,it,expect,vi,afterEach } from 'vitest';
import { adminObserved } from './admin-api';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function fixtures(response:Response) {
 vi.stubGlobal('window',{location:{href:''}});
 vi.stubGlobal('localStorage',{getItem:()=> 'local-test-fixture',removeItem:vi.fn()});
 vi.stubGlobal('fetch',vi.fn(async()=>response));
}
describe('admin observations',()=>{
 it('preserves a measured zero and the server timestamp rather than inventing a new observation time',async()=>{
  const meta={observedAt:1000,expiresAt:61000,source:'Recorded events',range:'UTC test window',timezone:'UTC',definition:'test'};
  fixtures(new Response(JSON.stringify({count:0}),{headers:{'X-Wordbase-Observation':JSON.stringify(meta)}}));
  const reading=await adminObserved<{count:number}>('/test');expect(reading.data.count).toBe(0);expect(reading.observation).toEqual(meta);
 });
 it('keeps missing metadata unknown',async()=>{
  fixtures(new Response('[]'));expect((await adminObserved('/test')).observation).toBeNull();
 });
 it('rejects failed requests instead of manufacturing an empty dataset',async()=>{
  fixtures(new Response(JSON.stringify({error:{message:'Temporarily unavailable'}}),{status:503}));
  await expect(adminObserved('/test')).rejects.toThrow('Temporarily unavailable');
 });
 it('treats malformed source timestamps as unknown',async()=>{
  fixtures(new Response('[]',{headers:{'X-Wordbase-Observation':'{"observedAt":"invalid"}'}}));
  expect((await adminObserved('/test')).observation).toBeNull();
 });
 it('bounds a stalled panel request without returning synthetic zeros',async()=>{
  vi.useFakeTimers();fixtures(new Response('[]'));
  vi.stubGlobal('fetch',vi.fn((_path,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))));
  const request=adminObserved('/slow');const assertion=expect(request).rejects.toThrow('Request timed out after 15 seconds');
  await vi.advanceTimersByTimeAsync(15_000);await assertion;
 });

});
