import { describe, expect, it } from 'vitest';
import { HOME_SOCIAL, socialImage, socialDescription, pageTitle } from './social-preview';
describe('social preview metadata', () => {
  it('provides versioned wide and square first-party artwork with known dimensions', () => {
    const result = socialImage(undefined, 'https://norvyn.com');
    expect(result).toMatchObject({ url:'https://norvyn.com/social/julian-cafe-v2.png?v=2',width:1200,height:630,type:'image/png',square:'https://norvyn.com/social/julian-cafe-square-v2.png' });
    expect(HOME_SOCIAL.zh.title).toBe('Julian.cafe · 最近做的东西，和想说的话');
    expect(HOME_SOCIAL.zh.description).not.toContain('独立开发者');
  });
  it('versions generated per-page cards while preserving authored cover images', () => {
    expect(socialImage('/og/apps/nearly.png','https://norvyn.com').url).toBe('https://norvyn.com/og/apps/nearly.png?v=4');
    expect(socialImage('https://cdn.example.com/my-cover.jpg','https://norvyn.com')).toMatchObject({ url:'https://cdn.example.com/my-cover.jpg',width:undefined,height:undefined,type:undefined,square:undefined });
  });
});

it('preserves authored summaries and uses the page subject for an empty legacy excerpt', () => {
  expect(socialDescription(' Authored summary. ', 'Page title', 'norvyn', 'Site description')).toBe('Authored summary.');
  expect(socialDescription('', 'IBM Personal Communications python script', 'norvyn', 'Site description')).toBe('IBM Personal Communications python script');
  expect(socialDescription('   ', 'norvyn', 'norvyn', 'Site description')).toBe('Site description');
});

it('keeps the introduction in the homepage title while preserving page subjects and descriptions', () => {
  expect(pageTitle(HOME_SOCIAL.zh.title,'norvyn')).toBe(HOME_SOCIAL.zh.title);
  expect(pageTitle(HOME_SOCIAL.en.title,'norvyn')).toBe(HOME_SOCIAL.en.title);
  expect(pageTitle('Cashie','norvyn')).toBe('Cashie — Julian.cafe');
  expect(pageTitle('norvyn','norvyn')).toBe('Julian.cafe');
  expect(HOME_SOCIAL.zh.description).toBe('我最近在折腾的东西，都放在这里。随便看看。');
});
