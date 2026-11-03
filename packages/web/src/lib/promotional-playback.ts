export interface PlaybackPolicy { visible: boolean; pageVisible: boolean; modalBlocked: boolean; reducedMotion: boolean; saveData: boolean; manual?: 'play' | 'pause' }
export function shouldPlayPromo(policy: PlaybackPolicy): boolean {
  return policy.visible && policy.pageVisible && !policy.modalBlocked && policy.manual !== 'pause'
    && (policy.manual === 'play' || (!policy.reducedMotion && !policy.saveData));
}

/** Video pauses natively. Animated images freeze to a canvas and unload their
 * animated source, so they cannot keep moving behind a poster or offscreen.
 * Drawing a cross-origin image onto a display-only canvas needs no readback. */
export function setupPromotionalPlayback(root: Document) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  type State = { target: HTMLElement; visible: boolean; manual?: 'play' | 'pause'; playing: boolean; policyPlay?: boolean; policyPause?: boolean; toggle?: HTMLButtonElement | null };
  const states = new Map<HTMLElement, State>();
  const isEn = () => root.documentElement.dataset.lang === 'en';
  function label(state: State, playing: boolean) {
    if (!state.toggle) return;
    const text = playing ? (isEn() ? 'Pause' : '暂停') : (isEn() ? 'Play' : '播放');
    state.toggle.textContent = text;
    state.toggle.setAttribute('aria-label', `${text} ${state.target.getAttribute('aria-label') || ''}`);
    state.toggle.setAttribute('aria-pressed', String(playing));
  }
  function freeze(state: State) {
    const image = state.target.querySelector<HTMLImageElement>('[data-promo-animated]')!;
    const poster = state.target.querySelector<HTMLImageElement>('[data-promo-poster]')!;
    const canvas = state.target.querySelector<HTMLCanvasElement>('canvas')!;
    if (image.hasAttribute('src') && image.complete && image.naturalWidth) {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      try {
        const context = canvas.getContext('2d');
        if (context) context.drawImage(image, 0, 0);
        else canvas.width = 0;
      } catch { canvas.width = 0; }
    }
    image.hidden = true;
    image.removeAttribute('src');
    canvas.hidden = !canvas.width || !canvas.height;
    poster.hidden = !canvas.hidden;
    state.playing = false;
    state.target.dataset.playing = 'false';
  }
  function update() {
    const modal = root.querySelector('dialog[open]');
    states.forEach(state => {
      const hidden = state.target.closest('[hidden]');
      const play = shouldPlayPromo({ visible: state.visible && !hidden, pageVisible: !root.hidden,
        modalBlocked: Boolean(modal && !modal.contains(state.target)), reducedMotion: reduced.matches, saveData, manual: state.manual });
      if (state.target instanceof HTMLVideoElement) {
        if (play && state.target.paused) {
          state.target.muted = true; // Every automatic start/resume is silent.
          state.policyPlay = true;
          void state.target.play().catch(() => { state.policyPlay = false; label(state, false); });
        } else if (!play && !state.target.paused) {
          state.policyPause = true;
          state.target.pause();
        }
        label(state, !state.target.paused);
      } else {
        if (play && !state.playing) {
          const image = state.target.querySelector<HTMLImageElement>('[data-promo-animated]')!;
          image.src = image.dataset.src!;
          image.hidden = false;
          state.target.querySelector<HTMLImageElement>('[data-promo-poster]')!.hidden = true;
          state.target.querySelector<HTMLCanvasElement>('canvas')!.hidden = true;
          state.playing = true;
          state.target.dataset.playing = 'true';
        } else if (!play) freeze(state);
        label(state, state.playing);
      }
    });
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target as HTMLElement);
      if (state) state.visible = entry.isIntersecting && entry.intersectionRatio >= .35;
    }
    update();
  }, { threshold: [0, .35] });
  function refresh() {
    states.forEach((state, target) => { if (!target.isConnected) { observer.unobserve(target); states.delete(target); } });
    root.querySelectorAll<HTMLElement>('video[data-promo], [data-promo-animation]').forEach(target => {
      if (states.has(target)) return;
      const state: State = { target, visible: false, playing: false, toggle: (target.closest('[data-promo-panel]') || target.closest('[data-promo-modal-content]') || target.parentElement)?.querySelector<HTMLButtonElement>('[data-promo-toggle]') };
      states.set(target, state);
      if (target instanceof HTMLVideoElement) {
        target.controls = target.hasAttribute('data-promo-native-controls');
        target.muted = true;
        target.addEventListener('play', () => {
          if (target.controls && !state.policyPlay) state.manual = 'play';
          state.policyPlay = false;
          label(state, true);
        });
        target.addEventListener('pause', () => {
          if (target.controls && !state.policyPause) state.manual = 'pause';
          state.policyPause = false;
          label(state, false);
        });
      }
      state.toggle?.addEventListener('click', () => {
        state.manual = (target instanceof HTMLVideoElement ? !target.paused : state.playing) ? 'pause' : 'play';
        update();
      });
      observer.observe(target);
      label(state, false);
    });
    update();
  }
  root.addEventListener('visibilitychange', update);
  root.addEventListener('promos:visibility', update);
  root.addEventListener('close', update, true);
  const modalObserver = new MutationObserver(update);
  root.querySelectorAll('dialog').forEach(dialog => modalObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  reduced.addEventListener('change', update);
  refresh();
  return { update, refresh };
}
