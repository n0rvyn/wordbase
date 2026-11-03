import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupPromotionalPlayback } from './promotional-playback';

class Button extends EventTarget {
  textContent = ''; attributes: Record<string, string> = {};
  setAttribute(k: string, v: string) { this.attributes[k] = v; }
}
class Video extends EventTarget {
  paused = true; muted = false; controls = true; isConnected = true; hiddenAncestor = false;
  toggle = new Button();
  parentElement = { querySelector: () => this.toggle };
  closest(selector: string) { return selector === '[hidden]' ? (this.hiddenAncestor ? {} : null) : this.parentElement; }
  getAttribute() { return 'Demo'; }
  hasAttribute() { return false; }
  play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
function fixture(reducedMotion = false) {
  const video = new Video();
  const reduced = Object.assign(new EventTarget(), { matches: reducedMotion });
  let intersect: (entries: unknown[]) => void = () => {};
  const root = Object.assign(new EventTarget(), {
    hidden: false, documentElement: { dataset: { lang: 'en' } }, modal: false,
    querySelector() { return this.modal ? { contains: () => false } : null; },
    querySelectorAll(selector: string) { return selector === 'dialog' ? [] : [video]; },
  });
  vi.stubGlobal('HTMLVideoElement', Video);
  vi.stubGlobal('navigator', { connection: { saveData: false } });
  vi.stubGlobal('matchMedia', () => reduced);
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} unobserve() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} });
  const playback = setupPromotionalPlayback(root as unknown as Document);
  const visibility = (visible: boolean) => intersect([{ target: video, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
  return { root, video, reduced, playback, visibility };
}
afterEach(() => vi.unstubAllGlobals());
describe('promotional playback lifecycle', () => {
  it('autoplays muted only while in view and pauses when a gallery panel is hidden', () => {
    const { video, visibility, playback } = fixture();
    expect(video.paused).toBe(true);
    visibility(true); expect(video.paused).toBe(false); expect(video.muted).toBe(true);
    video.hiddenAncestor = true; playback.update(); expect(video.paused).toBe(true);
    video.hiddenAncestor = false; visibility(false); expect(video.paused).toBe(true);
  });
  it('keeps reduced-motion previews still until an explicit play, including after selection changes', () => {
    const { video, visibility, reduced } = fixture(true);
    visibility(true); expect(video.paused).toBe(true);
    video.toggle.dispatchEvent(new Event('click')); expect(video.paused).toBe(false);
    visibility(false); expect(video.paused).toBe(true);
    visibility(true); expect(video.paused).toBe(false);
    video.toggle.dispatchEvent(new Event('click')); expect(video.paused).toBe(true);
    reduced.matches = false; reduced.dispatchEvent(new Event('change')); expect(video.paused).toBe(true);
  });
  it('distinguishes native player choices from autoplay and preserves explicit pause', () => {
    const { video, visibility, reduced } = fixture();
    video.controls = true;
    visibility(true); expect(video.paused).toBe(false);
    reduced.matches = true; reduced.dispatchEvent(new Event('change')); expect(video.paused).toBe(true);
    void video.play(); expect(video.paused).toBe(false);
    video.pause(); expect(video.paused).toBe(true);
    visibility(false); visibility(true); expect(video.paused).toBe(true);
  });
  it('pauses in background tabs and under unrelated dialogs, then resumes only eligible media', () => {
    const { root, video, visibility, playback } = fixture();
    visibility(true); expect(video.paused).toBe(false);
    root.hidden = true; root.dispatchEvent(new Event('visibilitychange')); expect(video.paused).toBe(true);
    root.hidden = false; root.modal = true; playback.update(); expect(video.paused).toBe(true);
    root.modal = false; root.dispatchEvent(new Event('promos:visibility')); expect(video.paused).toBe(false);
  });
});
