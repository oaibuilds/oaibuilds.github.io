// main.js
import { RevealOnScroll } from './utils/reveal-on-scroll.js';
import { Orb } from './components/orb.js';
import { Timeline } from './components/timeline.js';


document.documentElement.classList.remove('no-js');

// reveal on scroll
new RevealOnScroll('.reveal, .card');

// orb
const orb = new Orb('#oOrb', { fpsCap: 60 });
// opcional: window.orb = orb;

// timeline
const timeline = new Timeline({
  list: '#tlList',
  year: '#tlYear',
  fill: '#tlFill',
  chip: '.chip',
});
// opcional: window.timeline = timeline;
