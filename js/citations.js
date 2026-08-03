/**
 * citations.js — the citation engine.
 *
 * Claims live in data/claims.json and sources in data/citations.json; nothing
 * factual is hardcoded into a view. Every claim renders with a numbered marker
 * that opens the full source — authors, journal, DOI, what kind of evidence it
 * is, and the caveat that belongs with it.
 *
 * The caveat is not optional. A citation that shows only the flattering half of
 * a study is worse than no citation, because it borrows the authority of
 * research while discarding the part that makes research trustworthy.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from './ui.js';

let db = null;

export async function loadCitations() {
  if (db) return db;
  const [citations, claims] = await Promise.all(
    ['data/citations.json', 'data/claims.json'].map(async (p) => {
      const res = await fetch(p, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Could not load ${p} (${res.status})`);
      return res.json();
    })
  );

  const sources = new Map(citations.sources.map(s => [s.id, s]));

  // Number sources in the order they are first cited, the way a paper does.
  const order = [];
  const walkClaims = (list) => {
    for (const c of list || []) for (const id of c.cites || []) {
      if (sources.has(id) && !order.includes(id)) order.push(id);
    }
  };
  for (const topic of claims.topics) {
    walkClaims(topic.claims);
    for (const section of topic.sections || []) walkClaims(section.claims);
  }
  const numbers = new Map(order.map((id, i) => [id, i + 1]));

  db = {
    sources,
    numbers,
    order,
    topics: claims.topics,
    evidenceLevels: citations.evidenceLevels,
    all: citations.sources
  };
  return db;
}

export function getCitations() {
  if (!db) throw new Error('Citations not loaded — call loadCitations() first.');
  return db;
}

export function sourceById(id) {
  return getCitations().sources.get(id) || null;
}

export function citationNumber(id) {
  return getCitations().numbers.get(id) ?? null;
}

const STRENGTH_LABEL = {
  rct: 'Randomised trial',
  'meta-analysis': 'Meta-analysis',
  cohort: 'Cohort study',
  modelling: 'Modelling study',
  guideline: 'Clinical guideline',
  regulatory: 'Regulatory standard',
  dataset: 'Official statistics',
  editorial: 'Our view, not a research finding'
};

/** A superscript marker that opens the source. */
export function citeMarker(sourceId) {
  const source = sourceById(sourceId);
  if (!source) return null;
  const n = citationNumber(sourceId);
  return h('button.cite', {
    type: 'button',
    'aria-label': `Source ${n}: ${source.title}`,
    title: `${source.authors} (${source.year})`,
    onclick: (e) => { e.stopPropagation(); openSource(sourceId); }
  }, String(n));
}

/** Render one claim: the sentence, its markers, its evidence label and detail. */
export function renderClaim(claim) {
  const strength = STRENGTH_LABEL[claim.strength] || claim.strength;
  return h('li.claim',
    h('p.claim__text',
      claim.text,
      ' ',
      ...(claim.cites || []).map(id => citeMarker(id)).filter(Boolean)
    ),
    h('div.claim__meta',
      h('span', { class: `evidence evidence--${claim.strength}` }, strength)
    ),
    claim.detail ? h('p.claim__detail', claim.detail) : null
  );
}

export function renderClaims(claims) {
  if (!claims?.length) return null;
  return h('ul.claim-list', ...claims.map(renderClaim));
}

/** The full record for one source. */
export function openSource(id) {
  const s = sourceById(id);
  if (!s) return;
  const n = citationNumber(id);
  const strength = STRENGTH_LABEL[s.type] || s.type;

  sheet(`Source ${n ?? ''}`.trim(),
    h('article.source-detail',
      h('h3.source-detail__title', s.title),
      h('p.source-detail__meta',
        s.authors, ' · ', String(s.year), h('br'),
        h('em', s.publication), s.detail ? `, ${s.detail}` : ''
      ),
      h('div.pill-row',
        h('span', { class: `evidence evidence--${s.type}` }, strength),
        s.doi ? h('span.pill', `DOI ${s.doi}`) : null,
        h('span.pill', `checked ${s.checked}`)
      ),
      s.summary ? h('div', h('h4.source-detail__label', 'What it found'), h('p', s.summary)) : null,
      s.caveat ? h('div.source-detail__caveat', h('h4.source-detail__label', 'What it does not show'), h('p', s.caveat)) : null,
      s.url
        ? h('p', h('a.btn.btn--small', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open the source ↗'))
        : null,
      h('p.fine-print', 'Opening a source leaves this app and visits the publisher. Nothing about you goes with you.')
    )
  );
}

/** The complete reference list, numbered. */
export function renderReferences() {
  const { order, sources } = getCitations();
  return h('ol.reference-list',
    ...order.map(id => {
      const s = sources.get(id);
      return h('li.reference',
        h('button.reference__link', { type: 'button', onclick: () => openSource(id) },
          h('strong', s.authors), ` (${s.year}). `, h('em', s.title), '. ', s.publication,
          s.detail ? `, ${s.detail}` : '', '.'
        )
      );
    })
  );
}

/** Sources that are in the bibliography but not cited by any claim. */
export function uncitedSources() {
  const { all, numbers } = getCitations();
  return all.filter(s => !numbers.has(s.id));
}
