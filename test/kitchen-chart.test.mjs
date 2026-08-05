/**
 * kitchen-chart.test.mjs — who can do what, as a grid rather than five lists.
 *
 * The old shape was age-major: one card per age band, each listing its jobs.
 * Because a job like setting the table suits every age there is, it was printed
 * in all five, and three usable jobs became eleven chips. These tests hold the
 * new shape to the two things that make it a chart rather than a rearrangement:
 * one row per job, and an axis that does not change between recipes.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const kitchen = read('data/kitchen.json');
const recipes = read('data/recipes.index.json').parts
  .map(p => read(p.file)).flatMap(p => p.recipes);

// The module reads a module-level `model` set by loadKitchen, which needs fetch.
// Every export takes the model as its last argument for exactly this reason.
const { jobsChart, bandsOfHousehold, jobsFor } = await import('../js/kitchen.js');

/* ------------------------------------------------------------------ *
 * The data the chart form depends on
 * ------------------------------------------------------------------ */

test('every age band carries a numeric range, not just a label', () => {
  // Parsing "9 to 12" off a display string to find a child's band would break
  // the first time somebody rewords a label.
  for (const band of kitchen.ages) {
    assert.equal(typeof band.from, 'number', `${band.id} has no from`);
    assert.equal(typeof band.to, 'number', `${band.id} has no to`);
    assert.ok(band.to >= band.from, `${band.id} runs backwards`);
  }
});

test('the bands tile the childhood years with no gaps and no overlaps', () => {
  const sorted = [...kitchen.ages].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    assert.equal(sorted[i].from, sorted[i - 1].to + 1,
      `${sorted[i - 1].id} ends at ${sorted[i - 1].to} and ${sorted[i].id} starts at ${sorted[i].from}`);
  }
});

test('every job suits a contiguous run of ages', () => {
  // The whole reason a row can be drawn as one bar. A job that suited toddlers
  // and teenagers but nobody in between would need a different mark.
  const order = kitchen.ages.map(a => a.id);
  for (const job of kitchen.jobs) {
    const idx = job.ages.map(a => order.indexOf(a)).sort((a, b) => a - b);
    assert.ok(idx.every((v, i) => i === 0 || v === idx[i - 1] + 1),
      `${job.id} skips a band: ${job.ages.join(', ')}`);
  }
});

/* ------------------------------------------------------------------ *
 * The chart
 * ------------------------------------------------------------------ */

const chartFor = (recipe) => jobsChart(recipe, kitchen);

test('a job appears once, however many ages it suits', () => {
  // The bug the chart exists to fix: "Set the table" printed five times.
  for (const recipe of recipes) {
    const chart = chartFor(recipe);
    if (!chart) continue;
    const ids = chart.rows.map(r => r.job.id);
    assert.equal(new Set(ids).size, ids.length, `${recipe.id} repeats a job`);
  }
});

test('the axis is the same for every recipe', () => {
  // An axis that changes shape between recipes cannot be compared with the last
  // one, and an empty column is an answer rather than an absence.
  for (const recipe of recipes.slice(0, 40)) {
    const chart = chartFor(recipe);
    if (!chart) continue;
    assert.equal(chart.bands.length, kitchen.ages.length, `${recipe.id} dropped a band`);
    for (const row of chart.rows) {
      assert.equal(row.cells.length, kitchen.ages.length, `${recipe.id}/${row.job.id}`);
    }
  }
});

test('the grid says exactly what the age-major version said', () => {
  // A rearrangement that quietly changes who can do what is not a rearrangement.
  for (const recipe of recipes.slice(0, 60)) {
    const chart = chartFor(recipe);
    if (!chart) continue;
    const byAge = jobsFor(recipe, kitchen);

    for (const { age, jobs } of byAge) {
      const col = chart.bands.findIndex(b => b.id === age.id);
      for (const job of jobs) {
        const row = chart.rows.find(r => r.job.id === job.id);
        assert.ok(row, `${recipe.id}: ${job.id} missing for ${age.id}`);
        assert.ok(row.cells[col].on, `${recipe.id}: ${job.id} lost its ${age.id} cell`);
        assert.deepEqual(row.cells[col].steps, job.steps,
          `${recipe.id}: ${job.id} at ${age.id} changed steps`);
      }
    }
  }
});

test('a cell offering fewer steps than the job has is marked as partial', () => {
  // This is the per-step safety model showing through: a five-year-old gets the
  // timer for step 2 and not for the step with the pan on it. Drawn the same as
  // a full cell, the grid would say they can do both.
  let seen = 0;
  for (const recipe of recipes) {
    const chart = chartFor(recipe);
    if (!chart) continue;
    for (const row of chart.rows) {
      for (const cell of row.cells) {
        if (!cell.on || !row.steps.length) continue;
        assert.equal(cell.partial, cell.steps.length < row.steps.length,
          `${recipe.id}/${row.job.id}: ${cell.steps.length} of ${row.steps.length} steps`);
        if (cell.partial) seen++;
      }
    }
  }
  assert.ok(seen > 0, 'no recipe in the collection exercises the partial state');
});

test('rows read youngest first, so the staircase goes one way', () => {
  for (const recipe of recipes.slice(0, 40)) {
    const chart = chartFor(recipe);
    if (!chart) continue;
    const froms = chart.rows.map(r => r.from);
    assert.deepEqual(froms, [...froms].sort((a, b) => a - b), recipe.id);
  }
});

test('from and to bracket exactly the cells that are on', () => {
  for (const recipe of recipes.slice(0, 40)) {
    const chart = chartFor(recipe);
    if (!chart) continue;
    for (const row of chart.rows) {
      row.cells.forEach((cell, i) => {
        if (cell.on) assert.ok(i >= row.from && i <= row.to, `${row.job.id} cell ${i} outside its bar`);
      });
    }
  }
});

/* ------------------------------------------------------------------ *
 * Whose column is whose
 * ------------------------------------------------------------------ */

test('a child in the house lands in the right column', () => {
  const found = bandsOfHousehold([
    { name: 'Maya', age: 6 },
    { name: 'Tom', age: 11 }
  ], kitchen);
  assert.deepEqual([...found.keys()].sort(), ['age.middle', 'age.older'].sort());
  assert.deepEqual(found.get('age.middle'), ['Maya']);
});

test('grown-ups and babies get no column', () => {
  const found = bandsOfHousehold([
    { name: 'Ana', age: 38 },
    { name: 'Baby', age: 1 },
    { name: 'Nobody', age: null },
    { name: 'Teen', age: 17 }
  ], kitchen);
  assert.equal(found.has('age.teen'), true, 'a seventeen-year-old is still a child in the kitchen');
  assert.equal([...found.values()].flat().includes('Ana'), false);
  assert.equal([...found.values()].flat().includes('Baby'), false);
});

test('two children of the same age share one column', () => {
  const found = bandsOfHousehold([{ name: 'A', age: 7 }, { name: 'B', age: 8 }], kitchen);
  assert.deepEqual(found.get('age.middle'), ['A', 'B']);
});

test('an empty household asks for nothing and breaks nothing', () => {
  assert.equal(bandsOfHousehold([], kitchen).size, 0);
  assert.equal(bandsOfHousehold(undefined, kitchen).size, 0);
});
