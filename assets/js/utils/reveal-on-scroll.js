// utils/reveal-on-scroll.js
// Utility: reveal elements once they enter the viewport
export class RevealOnScroll {
  /**
   * @param {string} selector - CSS selector for target elements
   * @param {IntersectionObserverInit} opts - Observer options
   *   e.g. { threshold: 0.12 }
   */
  constructor(selector, opts = { threshold: 0.12 }) {
    // Select all target elements
    this.targets = document.querySelectorAll(selector);

    // IntersectionObserver: add .revealed when element is visible
    this.io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          this.io.unobserve(e.target); // unobserve once revealed
        }
      });
    }, opts);

    // Observe each target
    this.targets.forEach((el) => this.io.observe(el));
  }
}
