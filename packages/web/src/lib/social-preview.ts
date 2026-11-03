/** Versioned first-party social artwork; old image URLs remain available. */
export const SOCIAL_SITE_NAME = 'Julian.cafe';
export const SOCIAL_IMAGE_VERSION = '2';
export const GENERATED_CARD_VERSION = '4';
export const SITE_SOCIAL_IMAGE = '/social/julian-cafe-v2.png';
export const SITE_SOCIAL_SQUARE = '/social/julian-cafe-square-v2.png';
export const SITE_SOCIAL_ALT = 'Julian.cafe: an orange coffee cup with cream steam on deep green';
export const HOME_SOCIAL = {
  zh: { title: 'Julian.cafe · 最近做的东西，和想说的话', description: '我最近在折腾的东西，都放在这里。随便看看。' },
  en: { title: 'Julian.cafe · Things I’m making and thinking about', description: 'What I’ve been making and figuring out lately. Have a look around.' },
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

/** Keep a complete branded homepage headline together without a second suffix. */
export function pageTitle(title: string, configuredSiteName: string): string {
  if (title === configuredSiteName) return SOCIAL_SITE_NAME;
  return title === SOCIAL_SITE_NAME || title.startsWith(`${SOCIAL_SITE_NAME} · `) ? title : `${title} — ${SOCIAL_SITE_NAME}`;
}
