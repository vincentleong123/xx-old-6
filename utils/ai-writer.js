/**
 * ai-writer.js — Clean description generator (zero dependencies)
 * Produces unique, natural descriptions from video metadata.
 * NO keyword stuffing, NO Markov salad.
 */

const EXPLICIT_WORDS = new Set([
  'lucah','bogel','pancut','memek','kontol','ngentot','sundal','pantat','kimak',
  'telanjang','bugil','coli','stagen','crot','skandal','henjut','batang','kulum','pepek',
  'isap','bontot','jilat','doggy','mesum','cabul','bejat','entot','ngewe','ngocok',
  'masturbasi','fuck','fucks','fucking','fucked','cum','cums','cumming','cumshot',
  'slut','sluts','blowjob','blowjobs','handjob','handjobs',
  'creampie','creampies','gangbang','gangbangs','doublepenetration',
  'buttfuck','anal','rimjob','titfuck','footjob','deepthroat','cowgirl',
  'threesome','foursome','squirting','non-con','noncon','revenge','blackmail',
  'objectification','degradation','sex','seks','sexual','seduction','seducing',
  'masturbation','bdsm','hentai','nsfw','xnxx','xvideo','xvideos'
]);

function cleanWords(text) {
  if (!text) return [];
  return text.replace(/[-_]/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !EXPLICIT_WORDS.has(w.toLowerCase()));
}

const TEMPLATES = [
  (title, cat) => `Watch ${title} on xMelayu. ${cat} category. HD streaming available.`,
  (title, cat) => `${title} - exclusive to xMelayu. ${cat} content, free to watch.`,
  (title, cat) => `Enjoy ${title}. This ${cat.toLowerCase()} video is part of the xMelayu collection.`,
  (title, cat) => `${title}. Stream it now on xMelayu in the ${cat.toLowerCase()} category.`,
  (title, cat) => `${title} - uploaded to xMelayu. Browse more ${cat.toLowerCase()} videos on our site.`,
  (title, cat) => `Watch ${title} in HD. Part of xMelayu's ${cat.toLowerCase()} collection.`,
  (title, cat) => `${title}. Free streaming on xMelayu. ${cat} category.`,
  (title, cat) => `${title} - xMelayu original. ${cat} content, watch free online.`,
  (title, cat) => `Stream ${title} now. This video is in the ${cat.toLowerCase()} category on xMelayu.`,
  (title, cat) => `${title}. Available on xMelayu with fast streaming. ${cat} category.`
];

function generateDescription(video, corpus) {
  const title = cleanWords(video.title || video.name || video.id).join(' ');
  const cat = video.category || 'Malay Amateur';
  const tags = cleanWords((video.subTags || []).concat(video.keywords || []).join(' '));

  const templateIdx = hashString(video.id || title) % TEMPLATES.length;
  const text = TEMPLATES[templateIdx](title, cat);

  const kw = [...new Set(tags)].slice(0, 8);

  return { text, keywords: kw };
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

module.exports = { generateDescription, cleanWords };
