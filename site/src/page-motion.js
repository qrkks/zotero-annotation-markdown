import { inView } from 'motion';

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

  for (const selector of ['.details', '.closing']) {
    inView(selector, element => {
      element.setAttribute('data-revealed', '');
    }, { amount: 0.15 });
  }
}
