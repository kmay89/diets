/**
 * learning.test.mjs — the app does not sort people into types.
 *
 * This file exists because the feature it guards is one somebody will eventually
 * be tempted to "improve" in the obvious direction: ask people whether they are
 * visual or verbal learners, and give each group less. That is the single most
 * popular idea in education that does not survive testing, and the app's own
 * research page now says so with sources. These tests make the code match.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const claims = read('data/claims.json');
const citations = read('data/citations.json');

test('the claim about learning styles is on the research page, with sources', () => {
  const topic = claims.topics.find(t => t.id === 'learning');
  assert.ok(topic, 'the learning topic is missing');
  assert.ok(topic.claims.length >= 3, 'a position this counterintuitive needs more than one citation');

  const known = new Set(citations.sources.map(s => s.id));
  for (const c of topic.claims) {
    assert.ok(c.cites?.length, `${c.id} has no source`);
    for (const id of c.cites) assert.ok(known.has(id), `${c.id} cites unknown source ${id}`);
  }
});

test('every source for it carries its own caveat', () => {
  // A citation showing only the flattering half of a study is worse than none,
  // and that goes double for a claim that contradicts what most people believe.
  const ids = new Set(claims.topics.find(t => t.id === 'learning').claims.flatMap(c => c.cites));
  for (const s of citations.sources.filter(x => ids.has(x.id))) {
    assert.ok(s.caveat && s.caveat.length > 40, `${s.id} has no real caveat`);
    assert.ok(s.doi || s.url, `${s.id} cannot be opened`);
  }
});

test('no setting asks what kind of learner somebody is', () => {
  // Turning a channel off because it is in your way is fine. Being sorted into
  // a type and shown less is the thing the evidence is against.
  const files = ['js/store.js', 'js/views/settings.js', 'js/views/onboarding.js'];
  for (const f of files) {
    assert.doesNotMatch(src(f), /learning\s*style|learner\s*type|visualLearner|isVisual|prefersVisual/i,
      `${f} sorts people into learning types`);
  }
});

test('a picture is never the only thing a step is shown as', () => {
  // The picture rows are aria-hidden and sit next to the sentence, which is the
  // whole argument for them. A picture that replaced the words would be a
  // pictogram nobody can check.
  for (const f of ['js/views/recipe.js', 'js/views/cook.js']) {
    const text = src(f);
    const hasPicture = /stepPicture|cookPicture/.test(text);
    if (!hasPicture) continue;
    assert.match(text, /aria-hidden/, `${f} draws pictures without marking them decorative`);
  }
});

test('every channel can be written down as words', () => {
  // Chart, picture and voice each have a text form, and it is the real text on
  // the page rather than a label tucked into an attribute.
  assert.match(src('js/timeline.js'), /export function timelineWords/);
  assert.match(src('js/step-picture.js'), /export function pictureWords/);
  assert.match(src('js/views/timeline-panel.js'), /timechart__words/);
});

test('nothing in the research copy relies on markup the page cannot render', () => {
  // The why screen renders claim bodies as plain text, so an asterisk meant as
  // emphasis arrives on screen as an asterisk.
  for (const topic of claims.topics) {
    for (const para of [topic.lede, ...(topic.body || [])]) {
      assert.doesNotMatch(String(para), /\*|_[a-z]+_|<[a-z]+>/i,
        `${topic.id} carries markup the why page shows literally: ${String(para).slice(0, 60)}`);
    }
  }
});

test('the new modules are precached like every other one', () => {
  const sw = src('sw.js');
  for (const f of ['js/timeline.js', 'js/step-picture.js', 'js/read-aloud.js', 'js/views/timeline-panel.js']) {
    assert.ok(sw.includes(`./${f}`), `${f} would not work offline`);
  }
});

test('no view reaches past read-aloud.js for the speech engine', () => {
  // The same rule the native runtime has: one module owns the seam, so there is
  // one place to check when a platform behaves differently.
  const views = readdirSync(new URL('../js/views', import.meta.url)).filter(f => f.endsWith('.js'));
  for (const f of views) {
    assert.doesNotMatch(src(`js/views/${f}`), /speechSynthesis|SpeechSynthesisUtterance/,
      `js/views/${f} talks to the synthesizer directly`);
  }
});
