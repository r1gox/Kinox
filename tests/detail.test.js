const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

let ctx;
try {
  ctx = load(['js/common.js', 'js/worker.js', 'js/detail.js'], 'this.__t = { mzCastRow };');
} catch (e) {
  ctx = null;
  console.error('No se pudo cargar detail.js en el sandbox:', e.message);
}

test('detail.js carga en el sandbox', () => assert.ok(ctx && ctx.__t));

test('mzCastRow() devuelve vacío sin reparto', () => {
  assert.equal(ctx.__t.mzCastRow({}), '');
  assert.equal(ctx.__t.mzCastRow({ credits: { cast: [] } }), '');
});

test('mzCastRow() escapa nombres y personajes', () => {
  const html = ctx.__t.mzCastRow({
    credits: { cast: [{ name: '<script>x</script>', character: `"><img onerror=1>`, profile_path: '/a.jpg' }] },
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
  assert.match(html, /&lt;script&gt;/);
});

test('mzCastRow() limita a 20 personas', () => {
  const cast = Array.from({ length: 40 }, (_, i) => ({ name: 'N' + i }));
  const n = (ctx.__t.mzCastRow({ credits: { cast } }).match(/class="cast-card"/g) || []).length;
  assert.equal(n, 20);
});

test('las recomendaciones salen solo del catálogo: no se piden ni se muestran las de TMDB', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js/detail.js'), 'utf8');
  assert.doesNotMatch(src, /recommendations/);
  assert.doesNotMatch(src, /mzRecommendedRow/);
  assert.match(src, /rowWorkerSimilar\('Recomendaciones'/);
});
