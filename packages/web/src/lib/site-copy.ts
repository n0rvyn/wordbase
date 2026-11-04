export const SITE_COPY_FIELDS = {
  "eyebrow": {
    "label": "Homepage eyebrow",
    "default": "Independent developer, writer & podcaster",
    "maxLength": 120
  },
  "headline": {
    "label": "Homepage headline",
    "default": "A curious mind.",
    "maxLength": 100
  },
  "headlineLead": {"default": "A few", "maxLength": 100, "label": "Homepage headline — second line prefix"},
  "headlineAccent": {
    "label": "Homepage headline — second line",
    "default": "good things.",
    "maxLength": 100
  },
  "introZh": {
    "label": "Homepage introduction — 中文",
    "default": "做一点有用的东西，写一点真实的想法。\n这是我的作品，也是我与世界相处的方式。",
    "maxLength": 400
  },
  "introEn": {
    "label": "Homepage introduction — English",
    "default": "Making useful things. Putting honest thoughts into words.\nA few things I make, and the way I meet the world.",
    "maxLength": 400
  },
  "footerZh": {
    "label": "Footer slogan — 中文",
    "default": "让好奇心，有处可去。",
    "maxLength": 160
  },
  "footerEn": {
    "label": "Footer slogan — English",
    "default": "A place for curiosity.",
    "maxLength": 160
  },
  "footerNote": {
    "label": "Footer closing line",
    "default": "Made of small things, thoughtfully.",
    "maxLength": 160
  },
  "shareTitleZh": {
    "label": "Homepage share title — 中文",
    "default": "Julian.cafe",
    "maxLength": 100
  },
  "shareTitleEn": {
    "label": "Homepage share title — English",
    "default": "Julian.cafe",
    "maxLength": 100
  },
  "shareDescriptionZh": {
    "label": "Homepage share subtitle — 中文",
    "default": "我最近在折腾的东西，都放在这里。随便看看。",
    "maxLength": 300
  },
  "shareDescriptionEn": {
    "label": "Homepage share subtitle — English",
    "default": "What I’ve been making and figuring out lately. Have a look around.",
    "maxLength": 300
  }
} as const;
export type SiteCopy = Record<keyof typeof SITE_COPY_FIELDS, string>;
export function resolveSiteCopy(copy?: Record<string, string>): SiteCopy {
  return Object.fromEntries(Object.entries(SITE_COPY_FIELDS).map(([key, field]) => [key, copy?.[key]?.trim() || field.default])) as SiteCopy;
}
