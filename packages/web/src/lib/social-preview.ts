/** Versioned first-party social artwork; old image URLs remain available. */
export const SOCIAL_IMAGE_VERSION = '2';
export const GENERATED_CARD_VERSION = '3';
export const SITE_SOCIAL_IMAGE = '/social/norvyn-v2.png';
export const SITE_SOCIAL_SQUARE = '/social/norvyn-square-v2.png';
export const SITE_SOCIAL_ALT = 'norvyn wordmark and an orange asterisk on warm paper';
export const HOME_SOCIAL = {
  zh: { title: '我做的东西', description: '做些自己想用的应用，写点最近在想的事。偶尔也聊一聊。' },
  en: { title: 'Things I make', description: 'Apps I want to use, things I’m thinking about, and the occasional conversation.' },
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
