type Entry = { kind: string; title: string; detail: string; path: string };
let installed = false;
export function setupPublicSearch() {
  if (installed) return;
  installed = true;
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-public-search]'));
  const dialog = panels.find(panel => panel instanceof HTMLDialogElement) as HTMLDialogElement | undefined;
  const standalone = panels.find(panel => panel.dataset.standalone);
  let index: Promise<Entry[]> | undefined;
  let opener: HTMLElement | null = null;
  const isEn = () => document.documentElement.dataset.lang === 'en';
  const label = (kind: string) => ({ writing: isEn() ? 'Writing' : '文字', apps: isEn() ? 'Apps' : '作品', podcast: isEn() ? 'Podcast' : '声音' }[kind] || kind);
  const localPath = (entry: Entry) => isEn() && entry.kind !== 'podcast' ? `/en${entry.path}` : entry.path;
  const load = () => index ||= fetch('/search-index.json').then(response => { if (!response.ok) throw new Error('Search index unavailable'); return response.json() as Promise<Entry[]>; }).catch(error => { index = undefined; throw error; });
  panels.forEach(panel => {
    const input = panel.querySelector<HTMLInputElement>('[data-search-input]')!;
    const results = panel.querySelector<HTMLElement>('[data-search-results]')!;
    const status = panel.querySelector<HTMLElement>('[data-search-status]')!;
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    let controller: AbortController | undefined;
    function render(entries: Entry[]) {
      results.replaceChildren();
      entries.forEach(entry => {
        const link = document.createElement('a'); link.href = localPath(entry);
        const small = document.createElement('small'); small.textContent = [label(entry.kind), entry.detail].filter(Boolean).join(' · ');
        link.append(small, document.createTextNode(`${entry.title} ↗`)); results.append(link);
      });
      status.textContent = entries.length ? (isEn() ? `${entries.length} ${entries.length === 1 ? 'result' : 'results'}` : `找到 ${entries.length} 项`) : (isEn() ? 'No matches. Try another word.' : '没有找到，换个词试试。');
    }
    async function search() {
      controller?.abort(); const current = ++generation;
      const query = input.value.trim();
      status.textContent = isEn() ? 'Searching…' : '正在查找……';
      try {
        const entries = await load();
        if (current !== generation) return;
        if (!query) {
          render(['writing','apps','podcast'].flatMap(kind => entries.filter(entry => entry.kind === kind).slice(0, kind === 'writing' ? 4 : kind === 'podcast' ? 5 : entries.length)));
          return;
        }
        const matched = entries.filter(entry => `${entry.title} ${entry.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
        render(matched);
        // Keep the existing full-text backend in addition to title/media search.
        const api = document.body.dataset.apiUrl;
        if (api) {
          controller = new AbortController();
          try {
            const response = await fetch(`${api}/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
            if (!response.ok) throw new Error('Full-text unavailable');
            const data = await response.json();
            if (current !== generation) return;
            const hits: Entry[] = (Array.isArray(data.results) ? data.results : []).map((hit: {title:string;slug:string}) => ({kind:'writing',title:hit.title,detail:'',path:`/posts/${hit.slug}`}));
            render([...new Map([...hits,...matched].map(entry => [entry.path,entry])).values()]);
          } catch (error) {
            if (current !== generation || (error instanceof Error && error.name === 'AbortError')) return;
            if (!matched.length) status.textContent = isEn() ? 'Full-text search is unavailable. Try a title, app or episode name.' : '全文搜索暂时不可用，可以搜索标题、应用或单集名称。';
          }
        }
      } catch { if (current === generation) status.textContent = isEn() ? 'Search is unavailable. Please try again.' : '搜索暂时不可用，请重试。'; }
    }
    panel.addEventListener('search-open', () => {
      panel.setAttribute('aria-label', isEn() ? 'Search' : '搜索');
      input.setAttribute('aria-label', isEn() ? 'Search apps, writing or podcasts' : '搜索应用、文章或播客');
      input.placeholder = isEn() ? 'Search apps, writing or podcasts…' : '搜索应用、文章或播客…';
      panel.querySelector('[data-search-close]')?.setAttribute('aria-label', isEn() ? 'Close search' : '关闭搜索');
      input.focus(); void search();
    });
    input.addEventListener('input', () => { clearTimeout(timer); controller?.abort(); generation++; timer = setTimeout(() => void search(), 200); });
    panel.querySelector('[data-search-close]')?.addEventListener('click', () => {
      if (panel instanceof HTMLDialogElement) panel.close();
      else location.assign(isEn() ? '/en' : '/');
    });
  });
  function open(target: HTMLElement) {
    if (standalone) { standalone.dispatchEvent(new Event('search-open')); return; }
    if (!dialog || dialog.open) return;
    opener = target; dialog.showModal(); dialog.dispatchEvent(new Event('search-open'));
  }
  document.querySelectorAll<HTMLAnchorElement>('#searchLink,.nav-search-mobile').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); open(link);
  }));
  document.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null;
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !target?.closest('input,textarea,select,[contenteditable],[role="textbox"]') && !document.querySelector('dialog[open]')) {
      event.preventDefault(); open(document.getElementById('searchLink')!);
    }
  });
  // Native dialog backdrop events target the dialog itself. Bounds distinguish
  // the backdrop from empty padding inside the search panel.
  const outside = (event: PointerEvent | MouseEvent) => {
    if (!dialog || event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  dialog?.addEventListener('click', event => {
    if (outside(event)) dialog.close();
  });
  dialog?.addEventListener('close', () => opener?.focus());
  if (standalone) standalone.dispatchEvent(new Event('search-open'));
}
