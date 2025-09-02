// main.js
// Entry point — initializes global UI components

import { RevealOnScroll } from './utils/reveal-on-scroll.js';
import { Orb } from './components/orb.js';
import { Timeline } from './components/timeline.js';

// -------- Boot --------

// Remove the "no-js" class (in case JS is disabled)
document.documentElement.classList.remove('no-js');

// Reveal animations for elements/cards when they scroll into view
new RevealOnScroll('.reveal, .card');

// Orb (animated background/visual effect)
const orb = new Orb('#oOrb', { fpsCap: 60 });

// Timeline (interactive roadmap)
const timeline = new Timeline({
  list: '#tlList',  // container for timeline items
  year: '#tlYear',  // element showing current year in the rail
  fill: '#tlFill',  // progress bar fill element
  chip: '.chip',    // filter chips
});
