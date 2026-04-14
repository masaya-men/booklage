/**
 * Creates a ripple effect at the given position within a parent element.
 *
 * Used when a dragged card lands to give tactile visual feedback.
 * The ripple element self-removes after the animation completes.
 *
 * @param x - Horizontal position in pixels relative to parentElement
 * @param y - Vertical position in pixels relative to parentElement
 * @param parentElement - The element to append the ripple into (should be position:relative)
 */
export function createRipple(x: number, y: number, parentElement: HTMLElement): void {
  const ripple = document.createElement('div')
  ripple.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 100px;
    height: 100px;
    margin-left: -50px;
    margin-top: -50px;
    border-radius: 50%;
    border: 2px solid var(--color-accent-primary);
    opacity: 0;
    pointer-events: none;
    animation: card-ripple 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `
  parentElement.appendChild(ripple)
  ripple.addEventListener('animationend', () => { ripple.remove() })
}
