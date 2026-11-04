import { describe,it,expect } from 'vitest';
import { readingStatus,emptyReading } from '../components/admin/DataNote';
describe('visible measurement status',()=>{
 it('distinguishes a fresh measured zero from an unavailable source',()=>{
  const reading={data:0,error:null,fetchedAt:1000,observation:{observedAt:1000,expiresAt:61000,source:'test',range:'test',timezone:'UTC',definition:'test'}};
  expect(readingStatus(reading,2000)).toBeNull();
  expect(readingStatus({...emptyReading(),error:'failed'},2000)).toBe('Unavailable');
  expect(readingStatus({...reading,error:'failed'},2000)).toBe('Stale · refresh failed');
  expect(readingStatus(reading,62000)).toBe('Stale snapshot');
 });
});
