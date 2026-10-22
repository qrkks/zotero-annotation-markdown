import { animate, inView } from 'motion';

export function initPageMotion() {
  const header = document.querySelector('.site-header');
  let frame;
  let compact = false;
  function updateHeader() {
    frame = undefined;
    const next = scrollY > (compact ? 16 : 40);
    if (next === compact) return;
    compact = next;
    header.toggleAttribute('data-compact', compact);
  }
  addEventListener('scroll', () => {
    if (frame === undefined) frame = requestAnimationFrame(updateHeader);
  }, { passive: true });
  addEventListener('pageshow', updateHeader);
  updateHeader();

  const title = document.querySelector('#hero-title');
  const marker = title.querySelector('.title-highlight');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const hoverPointer = matchMedia('(hover: hover) and (pointer: fine)');
  let markerAnimation;
  function stopMarker() {
    markerAnimation?.stop();
    markerAnimation = undefined;
    marker.style.removeProperty('--marker-scale');
  }
  title.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || reducedMotion.matches || !hoverPointer.matches) return;
    markerAnimation?.stop();
    marker.style.setProperty('--marker-scale', '0');
    marker.setAttribute('data-marker-replay', '');
    markerAnimation = animate(0, 1, {
      duration: .65,
      ease: [.22, 1, .36, 1],
      onUpdate: value => marker.style.setProperty('--marker-scale', String(value)),
    });
  });
  reducedMotion.addEventListener('change', event => { if (event.matches) stopMarker(); });
  hoverPointer.addEventListener('change', event => { if (!event.matches) stopMarker(); });

  for (const selector of ['.details', '.closing']) {
    inView(selector, element => {
      element.setAttribute('data-revealed', '');
    }, { amount: 0.15 });
  }
}
