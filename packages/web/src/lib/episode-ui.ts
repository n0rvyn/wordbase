// Shared per-episode client wiring used by BOTH the podcast list page
// (pages/podcast/index.astro) and the single-episode page (pages/podcast/[slug].astro).
// Extracted verbatim from the original inline list-page <script> so the two
// pages run identical, single-source logic — no behavioral change.
//
// Each function operates on a root element + its dataset (data-slug, data-api-url)
// and is independent: wireFeedback queries within its root; wireTranscript reaches
// the <audio> via the nearest `.ep-item` ancestor — so any caller MUST nest the
// `.tx` block inside an `.ep-item` that also contains the player.
import { categoryToReaction } from './feedback';
import { segmentTranscript, blockAtProgress, type TxBlock } from './transcript';
import { dict, type Lang } from './i18n';

// Resolve the current UI language (defaults to 'zh' if unset — BaseLayout
// always sets it on <html data-lang="…"> at first paint, but the same module
// may be reached by tests that don't render the page).
function uiLang(): Lang {
  const v = document.documentElement.dataset.lang;
  return v === 'en' ? 'en' : 'zh';
}

// A submission locks this episode's control on THIS browser for 24h. After that
// the chips return, so a re-listen the next day can leave fresh feedback.
const FB_TTL_MS = 24 * 60 * 60 * 1000;
// The "已收到 · 谢谢" acknowledgment is transient: it confirms the submit, then
// fades away — the feedback is recorded, so the line need not linger.
const FB_DISMISS_MS = 30 * 1000;
const fbKey = (slug: string) => `wb_ep_fb_${slug}`;

function alreadyGiven(slug: string): boolean {
  try {
    const raw = localStorage.getItem(fbKey(slug));
    if (!raw) return false;
    const { ts } = JSON.parse(raw) as { ts?: number };
    if (typeof ts !== 'number' || Date.now() - ts >= FB_TTL_MS) {
      localStorage.removeItem(fbKey(slug));
      return false;
    }
    return true;
  } catch {
    return false; // private mode / storage disabled → degrade to no memory
  }
}

function remember(slug: string, category: string): void {
  try {
    localStorage.setItem(fbKey(slug), JSON.stringify({ ts: Date.now(), category }));
  } catch { /* storage unavailable — nothing to persist, server dedup still guards */ }
}

function hide(root: HTMLElement): void {
  root.style.display = 'none';
}

// Reveal the pre-rendered acknowledgment and hide the interactive controls,
// then fade it out and collapse. NOTE: the <p class="ep-fb-thanks"> lives in
// the template (not injected via innerHTML) so Astro's scoped styles — which
// match on a data-astro-cid attribute only present on build-time elements —
// actually apply to it. Injecting it at runtime silently dropped the styling.
function showThanks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.ep-fb-chips, .ep-fb-note, .ep-fb-hint, .ep-fb-msg')
    .forEach((el) => el.classList.add('msg-hidden'));
  const thanks = root.querySelector<HTMLElement>('.ep-fb-thanks');
  if (!thanks) { hide(root); return; }
  thanks.classList.remove('msg-hidden');
  window.setTimeout(() => {
    thanks.classList.add('ep-fb-thanks--out');
    window.setTimeout(() => hide(root), 400);
  }, FB_DISMISS_MS);
}

export function wireFeedback(root: HTMLElement) {
  const slug = root.dataset.slug;
  const apiUrl = root.dataset.apiUrl;
  if (!slug || !apiUrl) return;

  // Within the 24h window this browser already gave feedback → hide the
  // control entirely. The acknowledgment was transient; on reload there is
  // nothing to show until the window lapses and the chips return.
  if (alreadyGiven(slug)) { hide(root); return; }

  const noteInput = root.querySelector<HTMLInputElement>('.ep-fb-note')!;
  const sayBtn = root.querySelector<HTMLButtonElement>('.ep-fb-say')!;
  const msgEl = root.querySelector<HTMLElement>('.ep-fb-msg')!;
  const chips = root.querySelectorAll<HTMLButtonElement>('.ep-fb-chip');

  // Optional note stays collapsed until the listener opts in — keeps the
  // resting state to a quiet row of chips. Tapping a chip still submits in one
  // step, with whatever note has been typed (empty if never revealed).
  sayBtn.addEventListener('click', () => {
    noteInput.classList.remove('msg-hidden');
    // Persistent send hint — the placeholder vanishes on input, so a standing
    // line tells the listener a chip tap (above) is what sends the note.
    root.querySelector<HTMLElement>('.ep-fb-hint')?.classList.remove('msg-hidden');
    sayBtn.classList.add('msg-hidden');
    noteInput.focus();
  });

  chips.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category!;
      const reaction = categoryToReaction(category as Parameters<typeof categoryToReaction>[0]);
      const note = noteInput.value.trim() || undefined;
      chips.forEach((b) => (b.disabled = true));
      noteInput.disabled = true;
      sayBtn.disabled = true;
      try {
        const res = await fetch(
          `${apiUrl}/api/podcasts/episodes/${encodeURIComponent(slug)}/feedback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reaction, category, note }),
          },
        );
        if (res.ok) {
          remember(slug, category);
          showThanks(root);
        } else {
          throw new Error('non-ok');
        }
      } catch {
        msgEl.textContent = dict['podcast.fbError'][uiLang()];
        msgEl.classList.remove('msg-hidden');
        chips.forEach((b) => (b.disabled = false));
        noteInput.disabled = false;
        sayBtn.disabled = false;
      }
    });
  });
}

// Transcript wiring: per-episode expand/fetch/highlight/scroll/seek.
// Independent of wireFeedback — preserves `<audio preload="none">` (download
// counting depends on it) and never touches `.ep-fb*` elements.
const TX_SCROLL_PAUSE_MS = 4000; // user manual scroll pauses auto-scroll for this long

export async function wireTranscript(root: HTMLElement) {
  const slug = root.dataset.slug;
  const apiUrl = root.dataset.apiUrl;
  if (!slug || !apiUrl) return;
  const toggle = root.querySelector<HTMLButtonElement>('.tx-toggle')!;
  const panel = root.querySelector<HTMLDivElement>('.tx-panel')!;
  const body = root.querySelector<HTMLDivElement>('.tx-body')!;
  const audio = root.closest('.ep-item')?.querySelector<HTMLAudioElement>('audio');
  if (!audio) return;

  let blocks: TxBlock[] = [];
  let lineEls: HTMLElement[] = [];
  let loaded = false;
  let inFlight = false; // a fetch is in-flight — guards concurrent re-entry without latching on error
  let activeIdx = -1;
  let userScrolledAt = 0;
  let suppressScrollUntil = 0; // scroll events fired before this timestamp are treated as program-initiated and ignored

  toggle.addEventListener('click', async () => {
    const open = panel.hasAttribute('hidden');
    if (open) {
      panel.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      if (!loaded && !inFlight) await load();
    } else {
      panel.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  async function load() {
    inFlight = true;
    try {
      const res = await fetch(`${apiUrl}/api/podcasts/episodes/${encodeURIComponent(slug!)}/transcript.txt`);
      if (!res.ok) throw new Error('non-ok');
      blocks = segmentTranscript(await res.text());
      body.innerHTML = ''; // injected .tx-line nodes lack data-astro-cid → :global styles (Pre-flight risk)
      lineEls = blocks.map((b, i) => {
        const p = document.createElement('p');
        p.className = 'tx-line' + (b.isHeading ? ' tx-line--h' : '');
        p.textContent = b.text;
        p.dataset.i = String(i);
        p.addEventListener('click', () => seekTo(i));
        body.appendChild(p);
        return p;
      });
      loaded = true; // latch only on success — an error leaves loaded=false so a re-expand retries
    } catch {
      body.innerHTML = `<p class="tx-empty">${dict['podcast.txError'][uiLang()]}</p>`;
    } finally {
      inFlight = false;
    }
  }

  function seekTo(i: number) {
    const ratio = blocks[i]?.startRatio ?? 0;
    const apply = () => { if (isFinite(audio!.duration)) audio!.currentTime = ratio * audio!.duration; };
    if (isFinite(audio!.duration) && audio!.duration > 0) {
      apply(); audio!.play().catch(() => {});
    } else {
      audio!.addEventListener('loadedmetadata', apply, { once: true });
      audio!.play().catch(() => {}); // preload=none: play() triggers load — equivalent to a user press, legitimate /download hit
    }
  }

  audio.addEventListener('timeupdate', () => {
    if (panel.hasAttribute('hidden') || !loaded || lineEls.length === 0) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    const idx = blockAtProgress(blocks, audio.currentTime / audio.duration);
    if (idx === activeIdx) return;
    if (activeIdx >= 0) lineEls[activeIdx]?.classList.remove('is-active');
    activeIdx = idx;
    const el = lineEls[idx];
    if (!el) return;
    el.classList.add('is-active');
    if (Date.now() - userScrolledAt > TX_SCROLL_PAUSE_MS) {
      suppressScrollUntil = Date.now() + 250; // program-initiated scroll event falls in this window
      // Center the active line. Use getBoundingClientRect deltas, not el.offsetTop —
      // offsetTop is relative to the offsetParent (the panel is not positioned, so
      // that's <body>), which would scroll to a wildly wrong, page-relative position.
      const elRect = el.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      panel.scrollTop += (elRect.top - panelRect.top) - (panel.clientHeight - el.clientHeight) / 2;
    }
  });

  // Time-window approach for distinguishing program vs. user scrolls: the
  // assignment above opens a 250ms suppression window during which all scroll
  // events are ignored; events outside the window are user-initiated → pause
  // auto-scroll for TX_SCROLL_PAUSE_MS. The window covers both failure modes
  // of a boolean pair: (a) assignment leaves scrollTop unchanged → no scroll
  // event (window expires harmlessly); (b) hypothetical smooth scrolling would
  // fire multiple events (all swallowed inside the window — smooth disabled
  // above regardless).
  panel.addEventListener('scroll', () => {
    if (Date.now() < suppressScrollUntil) return;
    userScrolledAt = Date.now();
  });
}
