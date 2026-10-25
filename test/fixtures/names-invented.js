// @ts-check
// INVENTED: not history. A tiny made-up list of names, with made-up rivers and lakes, in the
// format of src/data/own/names.json, to test the code that reads it (src/ui/map/names.js).
// Nothing here is a real name, source or date.

/** @type {import('../../src/ui/map/names.js').NamesInfo} */
export const info = {
  sources: {
    'src-a': { title: 'Invented Chronicle A', author: 'Invented Author', written: 1227, about: true },
    'src-b': { title: 'Invented Rhymed Chronicle B', author: 'Invented Poet', written: 1326, copy: 'Invented copy' },
    'src-d': { title: 'Invented Geography D', author: 'Invented Geographer', written: 43 },
    'src-e': { title: 'Invented Notes E', author: 'Invented Writer', written: -44, about: true },
    'src-c': { title: 'Invented Annals C', author: 'Invented Annalist' },
  },
  languages: { la: 'Latin', gmh: 'Middle High German', grc: 'Ancient Greek', orv: 'Old East Slavic' },
  regions: [{ id: 'home', name: 'Homeland', rule: 'today' }, { id: 'west', name: 'Westland' }],
  periods: {
    west: [{ from: 1219, to: 1290, language: 'la', source: 'src-a' }, { from: 1290, to: 1400, language: 'gmh', source: 'src-b', marks: ['TO CHECK'] }],
  },
  features: [
    { kind: 'river', wikidata: 'Qr1', names: [
      { region: 'west', stretches: ['Alpha'], name: 'Alphus', language: 'la', source: 'src-a', where: 'I 2' },
      { region: 'west', stretches: ['Alpha'], name: 'Alphe', language: 'gmh', source: 'src-b', where: 'v. 1' },
      { region: 'west', stretches: ['Beta'], from: 1250, name: 'Betus', language: 'la', source: 'src-a', attested: 1300, marks: ['estimate'] },
      { region: 'west', stretches: ['Alpha'], name: 'Alphonse', language: 'la', source: 'src-e', map: false },
    ] },
    { kind: 'river', wikidata: 'Qr2', names: [
      { region: 'west', name: 'Gammus', language: 'la', source: 'src-a' },
      { region: 'west', name: 'Gamaris', language: 'grc', source: 'src-d', marks: ['disputed'], map: false },
      { region: 'west', name: 'Gamma-annal', language: 'orv', source: 'src-c', attested: 1253 },
    ] },
    { kind: 'lake', wikidata: 'Ql1', names: [
      { region: 'west', name: 'Deltus', gloss: 'Mother of lakes', language: 'la', source: 'src-a', where: 'XV 7' },
      { region: 'west', name: 'Deltun', language: 'gmh', source: 'src-b' },
    ] },
    { kind: 'lake', wikidata: 'Ql2', names: [{ region: 'home', name: 'Epsilonus', language: 'la', source: 'src-a' }] },
    { kind: 'lake', wikidata: 'Qnone', names: [{ region: 'west', name: 'Nowhere', language: 'la', source: 'src-a' }] },
  ],
  seas: [
    { id: 'main', name: 'Invented Sea', ring: null, names: [{ name: 'Mare Inventum', gloss: 'the invented sea', language: 'la', source: 'src-a', where: 'IV 10' }] },
    { id: 'gulf', name: 'Invented Gulf', ring: [100, 100, 300, 100, 300, 300, 100, 300], marks: ['TO CHECK'], names: [] },
  ],
};

/** A square ring from corner (x, y), side s. */
const square = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => Int32Array.from([x, y, x + s, y, x + s, y + s, x, y + s]);

/** @type {import('../../src/ui/map/load.js').WaterData} */
export const water = {
  // line 0: Alpha (river 0), line 1: Beta (river 0, a stretch with a local name), line 2: Gamma, line 3: Zeta (not in the list)
  rivers: [
    Int32Array.from([0, 500, 1000, 500, 2000, 500]), Int32Array.from([2000, 500, 3000, 500, 4000, 500]),
    Int32Array.from([0, 1500, 4000, 1500]), Int32Array.from([0, 2500, 4000, 2500]),
  ],
  riverLevels: new Uint8Array(3 + 3 + 2 + 2),
  riverOf: Uint32Array.from([0, 0, 1, 2]),
  riverInfo: [
    { name: 'Alpha', names: { en: 'Alpha River', lv: 'Alfa', ru: 'Альфа' }, wikidata: 'Qr1', lengthKm: 800 },
    { name: 'Gamma', names: {}, wikidata: 'Qr2', lengthKm: 400 },
    { name: 'Zeta', names: {}, wikidata: 'Qr3', lengthKm: 300 },
  ],
  lineName: Uint32Array.from([0, 1, 0, 0]),
  lineNames: ['', 'Beta'],
  lineLocal: ['', 'Бэта'],
  lakes: [square(5000, 5000, 600), square(5100, 5100, 100), square(7000, 5000, 400), square(9000, 5000, 200)],
  lakeLevels: new Uint8Array(16),
  lakeOf: Uint32Array.from([0, 0, 1, 2]),
  lakeInfo: [
    { name: 'Delta', names: { en: 'Delta Lake' }, wikidata: 'Ql1', areaKm2: 3600, at: [5300, 5300] },
    { name: 'Epsilon', names: {}, wikidata: 'Ql2', areaKm2: 1600, at: [7200, 5200] },
    { name: 'Eta', names: {}, wikidata: 'Ql3', areaKm2: 400, at: [9100, 5100] },
  ],
  lineTag: Uint32Array.from([0, 0, 0, 0]),
  lakeTag: Uint32Array.from([1, 2, 0]),
  tags: ['', 'invented-reservoir', 'osm-year-1960'],
};

/** @type {{ entries: import('../../src/ui/map/load.js').DatedEntry[], cites: Record<string, string> }} */
export const dated = {
  entries: [
    { id: 'invented-reservoir', kind: 'reservoir', on: [1959, null], fact: 'Invented reservoir, filled 1959.', source: 's1', toCheck: 'the year' },
    { id: 'osm-start-date', kind: 'rule', tagPrefix: 'osm-year-', fact: 'Invented man-made lake.' },
    { id: 'about-gamma', kind: 'fact', about: { wikidata: 'Qr2' }, fact: 'Invented fact about Gamma.' },
  ],
  cites: { s1: 'Invented source one' },
};
