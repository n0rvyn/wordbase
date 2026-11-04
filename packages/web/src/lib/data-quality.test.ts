import { describe, it, expect } from 'vitest';
import { coverage } from '../components/admin/DataQualityPanel';
describe('coverage denominators',()=>{
 it('distinguishes measured zero from a window without any sample',()=>{
  expect(coverage(0,0)).toBe('No sample');
  expect(coverage(0,10)).toBe('0%');
  expect(coverage(3,4)).toBe('75%');
 });
});
