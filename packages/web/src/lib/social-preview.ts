/** Versioned first-party social artwork; old image URLs remain available. */
export const SOCIAL_SITE_NAME = 'Julian.cafe';
export const SOCIAL_IMAGE_VERSION = '1';
export const GENERATED_CARD_VERSION = '4';
export const SITE_SOCIAL_IMAGE = '/social/julian-cafe-v1.png';
export const SITE_SOCIAL_SQUARE = '/social/julian-cafe-square-v1.png';
export const SITE_SOCIAL_ALT = 'Julian.cafe: an orange coffee cup with cream steam on deep green';
export const HOME_SOCIAL = {
  zh: { title: 'Julian.cafe', description: '我最近在折腾的东西，都放在这里。随便看看。' },
  en: { title: 'Julian.cafe', description: 'What I’ve been making and figuring out lately. Have a look around.' },
};
export function socialImage(input: string | undefined, origin: URL | string) {
  const generated = !input || /^\/og\/.*\.png$/.test(input);
  const url = new URL(input || SITE_SOCIAL_IMAGE, origin);
  if (generated) url.searchParams.set('v', input ? GENERATED_CARD_VERSION : SOCIAL_IMAGE_VERSION);
  return { url: url.href, generated, width: generated ? 1200 : undefined, height: generated ? 630 : undefined,
    type: generated ? 'image/png' : undefined, square: !input ? new URL(SITE_SOCIAL_SQUARE, origin).href : undefined };
}

/** Never invent a summary when an authored excerpt is empty. */
export function socialDescription(provided: string | undefined, title: string, siteName: string, siteDescription: string): string {
  return provided?.trim() || (title.trim() && title !== siteName ? title.trim() : siteDescription.trim() || siteName);
}
