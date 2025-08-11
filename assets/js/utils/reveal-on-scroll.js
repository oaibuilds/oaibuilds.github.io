// utils/reveal-on-scroll.js
export class RevealOnScroll {
  constructor(selector, opts = { threshold: 0.12 }) {
    this.targets = document.querySelectorAll(selector);
    this.io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          this.io.unobserve(e.target);
        }
      });
    }, opts);
    this.targets.forEach((el) => this.io.observe(el));
  }
}
