// Single source of truth for site chrome UI text + language detection helpers.
//
// Two consumers apply these to the DOM:
//   1. The T.astro component renders <span data-l="zh|en"> pairs at build time
//      (one copy per language, swapped via CSS rules on :root[data-lang] — see
//      styles/tokens.css for the show/hide rules).
//   2. BaseLayout's bundled <script> imports detectLang/nextLang/applyAttrI18n
//      for runtime attribute translation (aria-label/placeholder/title).
//   3. BaseLayout's head FOUC-prevention bootstrap is is:inline and CANNOT
//      import a module, so it hand-mirrors the detectLang three-level guard.
//      Keep that inline copy in sync with detectLang() here.
//
// The dictionary below is filled BEFORE any page imports this module, so
// consumers never render literal key strings on first paint.

export type Lang = 'zh' | 'en';
export const DEFAULT_LANG: Lang = 'zh';

export interface Entry {
  zh: string;
  en: string;
}

export const dict: Record<string, Entry> = {
  // ── common (shared chrome) ─────────────────────────────────────────────────
  'common.langToggle':  { zh: '切换语言',     en: 'Toggle language' },
  'common.themeToggle': { zh: '切换主题',     en: 'Toggle theme' },
  'common.menu':        { zh: '菜单',         en: 'Menu' },
  'common.back':        { zh: '返回',         en: 'Back' },

  // ── nav / foot ─────────────────────────────────────────────────────────────
  'nav.apps':    { zh: 'Apps',    en: 'Apps' },
  'nav.writing': { zh: 'Writing', en: 'Writing' },
  'nav.podcast': { zh: 'Podcast', en: 'Podcast' },
  'foot.tagline': {
    zh: '独立开发者，住在一座有海的城市。做 App、写字、录播客，慢慢来。',
    en: 'An independent developer living by the sea. Building apps, writing essays, recording a podcast — slowly.',
  },
  'foot.colNav':      { zh: 'Navigate', en: 'Navigate' },
  'foot.colMore':     { zh: '更多',     en: 'More' },
  'foot.colElsewhere':{ zh: 'Elsewhere',en: 'Elsewhere' },
  'foot.linkApps':    { zh: '作品',     en: 'Apps' },
  'foot.linkWriting': { zh: '写作',     en: 'Writing' },
  'foot.linkPodcast': { zh: '播客',     en: 'Podcast' },
  'foot.linkAbout':   { zh: '关于',     en: 'About' },
  'foot.linkCategories': { zh: '分类',  en: 'Categories' },
  'foot.linkTags':       { zh: '标签',  en: 'Tags' },
  'foot.linkArchives':   { zh: '归档',  en: 'Archive' },
  'foot.builtWith':   { zh: 'Built with Wordbase', en: 'Built with Wordbase' },

  // ── home (index) ───────────────────────────────────────────────────────────
  // 门面文案，英文已 review 定稿（native pass 2026-06-11）
  'home.spine.lab':    { zh: 'norvyn', en: 'norvyn' },
  'home.spine.note':   {
    zh: '独立 iOS 开发者，写作者，播客主播。',
    en: 'An independent iOS developer, writer, and podcaster.',
  },
  'home.hero.eyebrow': {
    zh: 'Independent iOS developer · 自 2023',
    en: 'Independent iOS developer · since 2023',
  },
  'home.hero.h1': {
    zh: '做小而克制的 App，也<em>写字</em>，也<em>录播客</em>。',
    en: 'I make small, restrained apps — and I <em>write</em>, and <em>record podcasts</em>.',
  },
  'home.hero.lede': {
    zh: '这里收着我亲手做的 iOS 应用、关于设计与工程的随笔，以及一档慢节奏的播客——一个人的全部作品，都在一处。',
    en: 'A home for the iOS apps I make by hand, the essays I write about design and engineering, and a slow-paced podcast — one person’s whole body of work, in one place.',
  },
  'home.hero.ctaApps':    { zh: '浏览作品',  en: 'Browse apps' },
  'home.hero.ctaPodcast': { zh: '订阅播客',  en: 'Subscribe' },
  'home.apps.lab':   { zh: 'Apps',    en: 'Apps' },
  'home.apps.note':  { zh: '每款只把一件事做好。', en: 'Each one does just one thing, well.' },
  'home.apps.featuredTag': { zh: 'Featured · 主推', en: 'Featured' },
  'home.apps.viewall':     { zh: '全部作品',         en: 'See all apps' },
  'home.writing.lab':  { zh: 'Writing',  en: 'Writing' },
  'home.writing.note': { zh: '关于设计取舍、工程实践与独立开发。', en: 'On design tradeoffs, engineering practice, and shipping solo.' },
  'home.writing.viewall': { zh: '全部文章', en: 'Read all' },
  'home.podcast.viewall': { zh: '全部单集', en: 'See all episodes' },
  'home.podcast.featuredPrefix': { zh: '最新一期', en: 'Latest episode' },
  'home.meta.category': { zh: 'Category', en: 'Category' },
  'home.meta.since':    { zh: 'Since',    en: 'Since' },
  'home.meta.store':    { zh: 'Store',    en: 'Store' },
  'home.meta.appStore': { zh: 'App Store',en: 'App Store' },

  // ── writing (index) ────────────────────────────────────────────────────────
  'writing.spine.lab':  { zh: 'Writing', en: 'Writing' },
  'writing.spine.note': { zh: '关于设计取舍、工程实践与独立开发。', en: 'On design tradeoffs, engineering practice, and shipping solo.' },
  'writing.eyebrow':    { zh: 'Essays · 自 2008', en: 'Essays · since 2008' },
  'writing.h1':         { zh: '写作', en: 'Writing' },
  'writing.lede': {
    zh: '把每天读到的、想到的，慢慢写下来。关于做产品这条路上，所有的取舍、怀疑与微小的确信。',
    en: 'I write slowly about the things I read and think about — the tradeoffs, doubts, and small certainties of making products.',
  },
  'writing.chipAll':      { zh: '全部',     en: 'All' },
  'writing.viewallCats':  { zh: '全部分类 →', en: 'All categories →' },
  'writing.featured.lab': { zh: 'Latest',    en: 'Latest' },
  'writing.featured.note':{ zh: '最新一篇。', en: 'The newest one.' },
  'writing.featured.tag': { zh: '最新 · Featured', en: 'Latest · Featured' },
  'writing.readMore':     { zh: '继续阅读',  en: 'Read more' },
  'writing.archive.lab':  { zh: 'Archive',  en: 'Archive' },
  'writing.archive.note': { zh: '全部文章，按时间倒序。', en: 'Every post, newest first.' },
  'writing.yearUnknown':  { zh: '未知',      en: 'Unknown' },

  // ── apps (index) ───────────────────────────────────────────────────────────
  'apps.spine.lab':  { zh: 'Apps',   en: 'Apps' },
  'apps.spine.note': { zh: '每款只把一件事做好。', en: 'Each one does just one thing, well.' },
  'apps.eyebrow':    { zh: 'Apps · 独立开发', en: 'Apps · Solo-built' },
  'apps.h1':         { zh: '作品',     en: 'Apps' },
  'apps.lede':       { zh: '小而克制的应用，每款只专注做好一件事。', en: 'Small, restrained apps — each one focused on doing one thing well.' },
  'apps.allApps.lab':  { zh: 'All Apps', en: 'All Apps' },
  'apps.allApps.note': { zh: '全部已发布的应用。', en: 'Every published app.' },
  'apps.empty':         { zh: '作品即将上线。', en: 'Apps coming soon.' },
  'apps.viewMore':      { zh: '了解更多',      en: 'Learn more' },
  'apps.spineNote':     { zh: 'norvyn 作品',   en: 'A norvyn app' },
  'apps.features.lab':  { zh: 'Features',      en: 'Features' },
  'apps.features.note': { zh: '把一件事，做到刚好。', en: 'One thing, done just right.' },
  'apps.screens.lab':   { zh: 'Screens',       en: 'Screens' },
  'apps.screens.note':  { zh: '左右滑动，看看它的样子。', en: 'Swipe to see what it looks like.' },
  'apps.about.lab':     { zh: 'About',         en: 'About' },
  'apps.about.note':    { zh: '它从哪来，为谁而做。', en: 'Where it came from, and who it’s for.' },
  'apps.meta.released': { zh: '首发',          en: 'Released' },
  'apps.meta.updated':  { zh: '最近更新',      en: 'Last updated' },
  'apps.meta.developer':{ zh: '开发者',        en: 'Developer' },
  'apps.meta.version':  { zh: '版本',          en: 'Version' },
  'apps.meta.rating':   { zh: '评分',          en: 'Rating' },
  'apps.meta.price':    { zh: '价格',          en: 'Price' },
  'apps.meta.minOs':    { zh: '系统要求',      en: 'Requires' },
  'apps.meta.category': { zh: '分类',          en: 'Category' },
  'apps.share':         { zh: '分享',          en: 'Share' },
  'apps.more.lab':      { zh: 'More',          en: 'More' },
  'apps.more.note':     { zh: '其它作品。',     en: 'Other apps.' },

  // ── podcast ────────────────────────────────────────────────────────────────
  'podcast.spine.lab':   { zh: 'Podcast', en: 'Podcast' },
  'podcast.spine.note':  { zh: '自制的 AI 信息源', en: 'A self-made AI briefing' },
  'podcast.eyebrow':     { zh: 'Podcast',  en: 'Podcast' },
  'podcast.eyebrowHost': { zh: '主播',     en: 'Host' },
  'podcast.subscribe':   { zh: '订阅 · RSS', en: 'Subscribe · RSS' },
  'podcast.latest.lab':  { zh: 'Latest',   en: 'Latest' },
  'podcast.latest.note': { zh: '最新一期。', en: 'The newest episode.' },
  'podcast.latestPrefix':{ zh: '最新一期',  en: 'Latest episode' },
  'podcast.emptyShow':   { zh: '播客即将上线，敬请期待。', en: 'The podcast is launching soon — stay tuned.' },
  'podcast.emptyEps':    { zh: '暂无单集。', en: 'No episodes yet.' },
  'podcast.episodes.lab':  { zh: 'Episodes', en: 'Episodes' },
  'podcast.episodes.note': { zh: '全部单集，按期号倒序。', en: 'Every episode, newest first.' },
  'podcast.transcript':    { zh: '逐字稿',   en: 'Transcript' },
  'podcast.expand':        { zh: '展开',     en: 'Expand' },
  'podcast.collapse':      { zh: '收起',     en: 'Collapse' },
  'podcast.fbSay':         { zh: '说一句',   en: 'Say a word' },
  'podcast.fbPlaceholder': { zh: '一句话（可选）', en: 'A line (optional)' },
  'podcast.fbHint':        { zh: '写完，点上面任一个表情发出去', en: 'When ready, tap any chip above to send.' },
  'podcast.fbThanks':      { zh: '已收到 · 谢谢', en: 'Got it · thanks' },
  'podcast.fbError':       { zh: '提交失败，稍后再试', en: 'Failed to submit — try again later.' },
  'podcast.txError':       { zh: '逐字稿加载失败', en: 'Failed to load transcript.' },
  'podcast.shareEpisode':  { zh: '分享本集', en: 'Share this episode' },
  'podcast.listenApple':   { zh: '在 Apple Podcasts 收听', en: 'Listen on Apple Podcasts' },
  'podcast.listenSpotify': { zh: '在 Spotify 收听',        en: 'Listen on Spotify' },
  'podcast.fallbackDesc':  { zh: '一档慢节奏的播客。', en: 'A slow-paced podcast.' },

  // ── about ──────────────────────────────────────────────────────────────────
  // 门面文案，英文已 review 定稿（native pass 2026-06-11）
  'about.spine.lab':  { zh: 'About', en: 'About' },
  'about.spine.note': { zh: '一个人，几件事。', en: 'One person, a few things.' },
  'about.eyebrow':    { zh: 'Independent developer · 自 2023', en: 'Independent developer · since 2023' },
  'about.h1':         { zh: '关于 norvyn', en: 'About norvyn' },
  'about.lede': {
    zh: '我做小而克制的 iOS 应用，写关于设计与工程的随笔，也在筹备一档慢节奏的播客。这个站点，是这几件事共同的家。',
    en: 'I make small, restrained iOS apps, write essays on design and engineering, and am putting together a slow-paced podcast. This site is the home for all of that.',
  },
  'about.story.lab':  { zh: 'Story',  en: 'Story' },
  'about.story.note': { zh: '我是谁，在做什么。', en: 'Who I am, what I do.' },
  'about.story.p1':   { zh: '你好，我是 <strong>norvyn</strong>。一个独立开发者。', en: 'Hi — I’m <strong>norvyn</strong>, an independent developer.' },
  'about.story.p2':   {
    zh: '2023 年，我开始认真地做自己的东西。没有团队、没有融资，只有一台笔记本和一些想法。',
    en: 'In 2023 I started taking my own work seriously. No team, no funding — just a laptop and a handful of ideas.',
  },
  'about.story.p3':   {
    zh: '目前上架了 <strong>Delphi</strong> — 一款基于牌阵的 iOS 应用，用于反思与思维整理。博客里已有 128+ 篇文章，记录设计与工程路上的思考。播客还在筹备中。',
    en: '<strong>Delphi</strong> is the one app I’ve shipped so far — an iOS app for reflection and thinking, built around card spreads. The blog already holds 128+ essays on design and engineering. The podcast is still in the works.',
  },
  'about.story.p4':   {
    zh: '我对「软件」的信念很简单：<strong>小一点，慢一点，诚实一点</strong>。喜欢只做一件事、但把它做到刚好的应用；喜欢加载很快、读起来安静的网页；喜欢在上线前，把一半花哨的功能删掉的那种克制。',
    en: 'My belief about software is simple: <strong>smaller, slower, more honest</strong>. I like apps that do one thing and do it just right; pages that load fast and read quietly; the discipline of cutting half the flashy features before launch.',
  },
  'about.story.p5':   {
    zh: '这个站点本身也是一次实践 — 它正在重新设计中，你现在看到的是进行时。',
    en: 'This site is itself a practice run — it’s mid-redesign, so what you’re looking at is work in progress.',
  },
  'about.now.lab':  { zh: 'Now',  en: 'Now' },
  'about.now.note': { zh: '最近在忙的事。', en: 'What I’m up to lately.' },
  'about.now.building': { zh: '在做',   en: 'Building' },
  'about.now.building.v': {
    zh: '<b>Delphi</b> — 迭代牌阵交互与截图展示，持续打磨细节。',
    en: '<b>Delphi</b> — iterating on the spread interactions and screenshot showcase, polishing the details.',
  },
  'about.now.rebuild': { zh: '在建',  en: 'Rebuilding' },
  'about.now.rebuild.v': {
    zh: '这个站点的前端重设计 (Phase 6/8)，正在进行中。',
    en: 'The front-end redesign of this site (Phase 6/8), underway.',
  },
  'about.now.preparing': { zh: '在准备', en: 'Preparing' },
  'about.now.preparing.v': {
    zh: '播客还未上线，节目形式还在构思阶段。',
    en: 'The podcast isn’t out yet — the format is still taking shape.',
  },
  'about.now.writing': { zh: '在写',  en: 'Writing' },
  'about.now.writing.v': {
    zh: '断断续续更新博客，128+ 篇文章，主题围绕设计、工程与独立创作。',
    en: 'Updating the blog in fits and starts — 128+ essays on design, engineering, and making things on your own.',
  },
  'about.colophon.lab':  { zh: 'Colophon', en: 'Colophon' },
  'about.colophon.note': { zh: '这个站点怎么做的。', en: 'How this site is made.' },
  'about.colophon.design.k': { zh: '设计', en: 'Design' },
  'about.colophon.design.v': {
    zh: '一套语义令牌驱动的系统，hairline 而非卡片，颜色只来自作品。',
    en: 'A semantic-token system. Hairlines, not cards. All color comes from the work itself.',
  },
  'about.colophon.type.k': { zh: '字体', en: 'Type' },
  'about.colophon.type.v': {
    zh: 'Geist（界面/标题）、Noto Sans SC（中文）、Geist Mono（标签与代码）。',
    en: 'Geist (UI / headlines), Noto Sans SC (Chinese), Geist Mono (labels and code).',
  },
  'about.colophon.theme.k': { zh: '主题', en: 'Theme' },
  'about.colophon.theme.v': {
    zh: '浅色 / 深色双主题，一个可切换的强调色，全站同步。',
    en: 'Light and dark themes, plus a switchable accent color — synced across the site.',
  },
  'about.colophon.accent.k': { zh: '强调色', en: 'Accent' },
  'about.colophon.build.k': { zh: '构建', en: 'Built with' },
  'about.colophon.build.v': {
    zh: 'Wordbase — 一个 AI 原生、支持 MCP 的内容系统。',
    en: 'Wordbase — an AI-native, MCP-enabled content system.',
  },
  'about.contact.lab':  { zh: 'Say hi',  en: 'Say hi' },
  'about.contact.note': { zh: '随时来信。', en: 'Drop a line anytime.' },
  'about.contact.lede': {
    zh: '最好的联系方式是邮件。我读每一封，也尽量回每一封。',
    en: 'Email is the best way to reach me. I read every one, and try to reply to them all.',
  },
  'about.contact.email': { zh: '写封邮件', en: 'Send an email' },

  // ── post (article) ─────────────────────────────────────────────────────────
  'post.publishedAt':  { zh: '发表于', en: 'Published' },
  'post.category':     { zh: '分类',   en: 'Category' },
  'post.readTime':     { zh: '阅读时长', en: 'Read time' },
  'post.readTimeTpl':  { zh: '约 {n} 分钟', en: '{n} min' },
  'post.toc':          { zh: '目录',   en: 'Contents' },
  'post.authorBio': {
    zh: '独立 iOS 开发者，写字的人。在一座有海的城市，慢慢地做一些小而确定的东西。',
    en: 'An independent iOS developer and writer — slowly making small, certain things in a city by the sea.',
  },
  'post.prev':         { zh: '← 上一篇', en: '← Previous' },
  'post.next':         { zh: '下一篇 →', en: 'Next →' },

  // ── archives ───────────────────────────────────────────────────────────────
  'archives.spine.lab':  { zh: 'Archive',  en: 'Archive' },
  'archives.spine.note': { zh: '{n} 篇文章，按时间倒序。', en: '{n} posts, newest first.' },
  'archives.eyebrow':    { zh: 'Essays · Timeline', en: 'Essays · Timeline' },
  'archives.h1':         { zh: '归档',     en: 'Archive' },
  'archives.lede':       { zh: '全部已发布的文章。', en: 'Every published post.' },
  'archives.all.lab':    { zh: 'All',     en: 'All' },

  // ── categories ─────────────────────────────────────────────────────────────
  'cat.index.spine.lab':  { zh: 'Categories', en: 'Categories' },
  'cat.index.spine.note': { zh: '{n} 个分类。', en: '{n} categories.' },
  'cat.index.eyebrow':    { zh: 'Writing · Topics', en: 'Writing · Topics' },
  'cat.index.h1':         { zh: '分类', en: 'Categories' },
  'cat.index.all.lab':    { zh: 'All',  en: 'All' },
  'cat.index.empty':      { zh: '暂无分类。', en: 'No categories yet.' },
  'cat.index.countTpl':   { zh: '{n} 篇', en: '{n} posts' },
  'cat.detail.spine.lab': { zh: 'Category', en: 'Category' },
  'cat.detail.spine.note':{ zh: '{n} 篇文章。', en: '{n} posts.' },
  'cat.detail.eyebrow':   { zh: '分类 · Category', en: 'Category · 分类' },
  'cat.detail.posts.lab': { zh: 'Posts',  en: 'Posts' },
  'cat.detail.empty':     { zh: '该分类暂无文章。', en: 'No posts in this category yet.' },

  // ── tags ───────────────────────────────────────────────────────────────────
  'tag.index.spine.lab':  { zh: 'Tags',  en: 'Tags' },
  'tag.index.spine.note': { zh: '{n} 个标签。', en: '{n} tags.' },
  'tag.index.eyebrow':    { zh: 'Writing · Tags', en: 'Writing · Tags' },
  'tag.index.h1':         { zh: '标签',  en: 'Tags' },
  'tag.index.all.lab':    { zh: 'All',   en: 'All' },
  'tag.index.empty':      { zh: '暂无标签。', en: 'No tags yet.' },
  'tag.detail.spine.lab': { zh: 'Tag',   en: 'Tag' },
  'tag.detail.spine.note':{ zh: '{n} 篇文章。', en: '{n} posts.' },
  'tag.detail.eyebrow':   { zh: '标签 · Tag', en: 'Tag · 标签' },
  'tag.detail.posts.lab': { zh: 'Posts', en: 'Posts' },
  'tag.detail.empty':     { zh: '该标签暂无文章。', en: 'No posts with this tag yet.' },

  // ── pager (page/[page]) ────────────────────────────────────────────────────
  'pager.eyebrowTpl': { zh: 'Writing · 第 {n} 页', en: 'Writing · Page {n}' },
  'pager.h1':         { zh: '文章',   en: 'Posts' },
  'pager.spine.lab':  { zh: 'Page {n}', en: 'Page {n}' },
  'pager.spine.note': { zh: '{cur} / {last}', en: '{cur} / {last}' },
  'pager.posts.lab':  { zh: 'Posts',   en: 'Posts' },
  'pager.newer':      { zh: '← 较新',  en: '← Newer' },
  'pager.older':      { zh: '较旧 →',  en: 'Older →' },
  'pager.home':       { zh: '← 首页',  en: '← Home' },

  // ── 404 ────────────────────────────────────────────────────────────────────
  'nf.title':  { zh: '页面不存在',   en: 'Page not found' },
  'nf.text':   { zh: '你访问的页面已被移除或从未存在过。', en: 'The page you’re looking for has been moved or never existed.' },
  'nf.back':   { zh: '← 返回首页',  en: '← Back to home' },

  // ── comment ────────────────────────────────────────────────────────────────
  'comment.title':     { zh: '评论',     en: 'Comments' },
  'comment.formTitle': { zh: '留下评论', en: 'Leave a comment' },
  'comment.name':      { zh: '名字 *',   en: 'Name *' },
  'comment.email':     { zh: '邮箱',     en: 'Email' },
  'comment.url':       { zh: '网站',     en: 'Website' },
  'comment.content':   { zh: '评论 *',   en: 'Comment *' },
  'comment.submit':    { zh: '提交',     en: 'Submit' },
  'comment.loading':   { zh: '加载中…',   en: 'Loading…' },
  'comment.empty':     { zh: '还没有评论，来说第一句话吧。', en: 'No comments yet — be the first to say something.' },
  'comment.loadError': { zh: '加载评论失败，请刷新重试。', en: 'Failed to load comments — please refresh.' },
  'comment.posted':    { zh: '评论已提交，审核后将显示。', en: 'Comment submitted — it will appear after review.' },
  'comment.submitError':{ zh: '提交失败，请重试。', en: 'Failed to submit — please try again.' },
  'comment.netError':  { zh: '网络错误，请重试。', en: 'Network error — please try again.' },

  // ── share ──────────────────────────────────────────────────────────────────
  'share.twitter':   { zh: 'Twitter',      en: 'Twitter' },
  'share.wechat':    { zh: 'WeChat',       en: 'WeChat' },
  'share.copy':      { zh: '复制链接',     en: 'Copy link' },
  'share.native':    { zh: '分享',         en: 'Share' },
  'share.wechatQR':  { zh: '微信扫码分享', en: 'Scan with WeChat to share' },
  'share.close':     { zh: '关闭',         en: 'Close' },

  // ── feedback (chips) ───────────────────────────────────────────────────────
  'feedback.great':      { zh: '很棒',   en: 'Great' },
  'feedback.repetitive': { zh: '重复',   en: 'Repetitive' },
  'feedback.disagree':   { zh: '不同意', en: 'Disagree' },
  'feedback.boring':     { zh: '没意思', en: 'Boring' },
  'feedback.shallow':    { zh: '太水',   en: 'Shallow' },

  // ── title (for tab swap, see Task 14) ──────────────────────────────────────
  // These values are the page-LEVEL English title WITHOUT the trailing
  // '— norvyn' site suffix; BaseLayout appends the suffix via the same
  // fullTitle/fullTitleEn rule for both languages, so the EN tab label is
  // canonical ('Apps — norvyn', not 'Apps — norvyn — norvyn'). API-derived
  // titles (posts/apps/podcast/tag and category detail pages) don't pass
  // a titleEn at all, so they're not represented here.
  'title.home':       { zh: 'norvyn',            en: 'norvyn' },
  'title.apps':       { zh: 'Apps',              en: 'Apps' },
  'title.writing':    { zh: '写作',              en: 'Writing' },
  'title.podcast':    { zh: '播客',              en: 'Podcast' },
  'title.about':      { zh: '关于',              en: 'About' },
  'title.archives':   { zh: '归档',              en: 'Archive' },
  'title.categories': { zh: '分类',              en: 'Categories' },
  'title.tags':       { zh: '标签',              en: 'Tags' },
  // 404's zh matches the existing static-rendered title; en mirrors it.
  'title.404':        { zh: '404',               en: 'Not found' },
  // Pager is a runtime template; pages substitute {n} and BaseLayout appends
  // the site suffix. Callers are responsible for replacing the placeholder.
  'title.page':       { zh: '第 {n} 页',         en: 'Page {n}' },
};

/**
 * Look up a dictionary entry. Missing key returns the key string in both
 * languages — the markup layer MUST handle the missing case (e.g. via
 * data-i18n fallback to the static Chinese default in the DOM). Never throws.
 */
export function t(key: string): Entry {
  const e = dict[key];
  return e ?? { zh: key, en: key };
}

/**
 * Three-level language detection (mirror exactly in BaseLayout's head bootstrap):
 *   1. Stored preference wins ('zh' | 'en').
 *   2. Falsy navigator.language → default language (defensive; some browsers
 *      expose it as undefined / empty string and a missing guard would let
 *      `''.toLowerCase().startsWith('zh')` return false and wrongly resolve
 *      to 'en').
 *   3. Otherwise: 'zh' if it starts with 'zh', else 'en'.
 */
export function detectLang(prefs: { lang?: string }, navLang: string | undefined): Lang {
  if (prefs.lang === 'zh' || prefs.lang === 'en') return prefs.lang;
  if (!navLang) return DEFAULT_LANG;
  return navLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Toggle between 'zh' and 'en'. */
export function nextLang(cur: string): Lang {
  return cur === 'en' ? 'zh' : 'en';
}

const ATTR_DATA_PREFIXES = ['data-i18n-aria', 'data-i18n-placeholder', 'data-i18n-title'] as const;
type AttrKind = 'aria-label' | 'placeholder' | 'title';
const KIND_FROM_PREFIX: Record<(typeof ATTR_DATA_PREFIXES)[number], AttrKind> = {
  'data-i18n-aria': 'aria-label',
  'data-i18n-placeholder': 'placeholder',
  'data-i18n-title': 'title',
};

/**
 * Translate every `[data-i18n-aria|placeholder|title]` element in `root`
 * to the active language. Missing keys are INTENTIONALLY skipped — using
 * the `t()` fallback (which echoes the key) would overwrite the static
 * Chinese default with the literal key string. Call this on initial load
 * AND every time the user toggles language.
 */
export function applyAttrI18n(root: Document | HTMLElement, lang: Lang): void {
  for (const prefix of ATTR_DATA_PREFIXES) {
    const attr = KIND_FROM_PREFIX[prefix];
    const els = root.querySelectorAll<HTMLElement>(`[${prefix}]`);
    els.forEach((el) => {
      const key = el.getAttribute(prefix);
      if (!key) return;
      if (!(key in dict)) return; // skip unknown keys; preserve the static default
      el.setAttribute(attr, dict[key][lang]);
    });
  }
}
