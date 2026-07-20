const fs = require('fs');
const path = require('path');

const KEYWORDS_PATH = path.join(__dirname, '..', 'seo', 'keywords.json');
const keywords = JSON.parse(fs.readFileSync(KEYWORDS_PATH, 'utf8'));

const STOP_WORDS = new Set([
  'a','an','the','is','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','can','could','shall','should','may','might',
  'i','you','he','she','it','we','they','me','him','her','us','them','my','your',
  'his','its','our','their','this','that','these','those','in','on','at','by',
  'for','with','about','of','to','from','up','down','out','off','over','under',
  'again','further','then','once','here','there','when','where','why','how',
  'all','each','every','both','few','more','most','other','some','such','no',
  'nor','not','only','own','same','so','than','too','very','just','and','or',
  'but','if','because','as','until','while','after','before','between',
  'yang','ini','itu','di','ke','dari','untuk','dan','atau','satu','dua','tiga',
  'dia','dengan','juga','dalam','pada','ada','apa','saja','sudah','lebih',
  'tak','tidak','siapa','mana','video','clip','episode','part','free','watch',
  'online','stream','download'
]);

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length)); }

function extractKeywords(text) {
  const words = text.toLowerCase().split(/[\s,;:.!?()'"\/]+/).filter(w => w.length > 2);
  const unique = [...new Set(words)].filter(w => !STOP_WORDS.has(w));
  return unique.sort((a, b) => {
    const fa = words.filter(x => x === a).length;
    const fb = words.filter(x => x === b).length;
    return (fb + b.length / 20) - (fa + a.length / 20);
  });
}

function classifyVideo(video) {
  const tags = (video.subTags || []).map(t => t.toLowerCase());
  const kw = (video.keywords || []).map(t => t.toLowerCase());
  const all = [...tags, ...kw];
  const joined = all.join(' ');

  if (/(tudung|hijab|ustazah|muslimah|labuh|kerudung)/.test(joined)) return 'hijab';
  if (/(janda|gersang|widow|milf|mature|bini\s*orang|ibu)/.test(joined)) return 'janda';
  if (/(couple|berdua|kekasih|boyfriend|girlfriend|pasangan|lovers)/.test(joined)) return 'couple';
  if (/(solo|alone|sendiri|self|main\s*sendiri)/.test(joined)) return 'solo';
  if (/(threesome|group|bertiga|orgy|party|ramai)/.test(joined)) return 'group';
  if (/(public|outdoor|kereta|tandas|parking|toilet|lift|rooftop|beach)/.test(joined)) return 'public';
  if (/(homestay|airbnb|hotel|bilik|motel|resort)/.test(joined)) return 'homemade';
  if (/(student|sekolah|kolej|universiti|uitm|matrikulasi|pelajar)/.test(joined)) return 'student';
  if (/(uniform|office|kerja|nurse|staff|kerani)/.test(joined)) return 'uniform';
  if (/(chubby|thick|curvy|gempal|berisi|gemuk)/.test(joined)) return 'chubby';
  if (/(bule|expat|foreigner|western|tourist|american|british|australian)/.test(joined)) return 'interracial';
  if (/(cina|chinese|nyonya)/.test(joined)) return 'chinese';
  if (/(thai|thailand|bangkok|pattaya)/.test(joined)) return 'thai';
  if (/(indonesian|indo|indonesia|jakarta|bali)/.test(joined)) return 'indonesian';
  if (/(japanese|jepun|tokyo|osaka)/.test(joined)) return 'japanese';
  if (/(korean|korea|seoul)/.test(joined)) return 'korean';
  if (/(skandal|scandal|viral|bocor|leak|telegram|whatsapp)/.test(joined)) return 'skandal';
  return 'default';
}

const CATEGORY_BANKS = {
  hijab: {
    tone: ['innocent', 'shy', 'modest', 'secretive', 'forbidden'],
    phrases: ['hidden desire', 'shy beauty', 'modest exterior', 'private passion', 'forbidden beauty'],
    style: ['natural light', 'intimate angles', 'soft focus', 'gentle movements', 'candid footage']
  },
  janda: {
    tone: ['experienced', 'confident', 'mature', 'passionate', 'desperate'],
    phrases: ['years of desire', 'mature passion', 'experienced touch', 'seasoned lover', 'lonely nights'],
    style: ['confident movements', 'experienced technique', 'passionate rhythm', 'mature beauty', 'seasoned moves']
  },
  couple: {
    tone: ['passionate', 'intimate', 'romantic', 'sensual', 'loving'],
    phrases: ['undeniable chemistry', 'genuine connection', 'real couple energy', 'intimate moments', 'shared passion'],
    style: ['loving touches', 'passionate embraces', 'romantic atmosphere', 'sweet foreplay', 'tender lovemaking']
  },
  solo: {
    tone: ['intimate', 'private', 'personal', 'sensual', 'slow'],
    phrases: ['private moment', 'intimate self-exploration', 'personal pleasure', 'quiet enjoyment', 'alone time'],
    style: ['close-up angles', 'slow movements', 'private setting', 'personal space', 'gentle touch']
  },
  group: {
    tone: ['intense', 'energetic', 'wild', 'passionate', 'frenzied'],
    phrases: ['multiple partners', 'shared pleasure', 'group dynamic', 'collective passion', 'intense energy'],
    style: ['multiple angles', 'dynamic action', 'group chemistry', 'energetic performance', 'coordinated rhythm']
  },
  public: {
    tone: ['risky', 'daring', 'adventurous', 'dangerous', 'thrilling'],
    phrases: ['public thrill', 'risk of being caught', 'outdoor adventure', 'daring exposure', 'adrenaline rush'],
    style: ['hidden camera', 'wide angles', 'outdoor lighting', 'surveillance style', 'candid shots']
  },
  homemade: {
    tone: ['real', 'raw', 'authentic', 'private', 'unpolished'],
    phrases: ['homemade video', 'private collection', 'personal recording', 'home setting', 'amateur charm'],
    style: ['home environment', 'personal camera', 'private moment', 'home video aesthetic', 'natural setting']
  },
  student: {
    tone: ['young', 'playful', 'curious', 'energetic', 'fresh'],
    phrases: ['young love', 'campus romance', 'student life', 'youthful energy', 'college days'],
    style: ['dorm room', 'campus setting', 'backpack aesthetic', 'young energy', 'student lifestyle']
  },
  uniform: {
    tone: ['professional', 'secret', 'after-hours', 'taboo', 'workplace'],
    phrases: ['office romance', 'work crush', 'after hours', 'secret affair', 'workplace fantasy'],
    style: ['office setting', 'uniform look', 'professional backdrop', 'corporate environment', 'workplace angles']
  },
  chubby: {
    tone: ['curvy', 'thick', 'beautiful', 'confident', 'alluring'],
    phrases: ['curvy beauty', 'thick goddess', 'body confidence', 'full figured', 'voluptuous charm'],
    style: ['body positive', 'curves on display', 'thick beauty', 'confident posing', 'natural curves']
  },
  interracial: {
    tone: ['exotic', 'cross-cultural', 'tropical', 'forbidden', 'adventurous'],
    phrases: ['cross-cultural connection', 'tropical romance', 'expat fantasy', 'forbidden attraction', 'foreign encounter'],
    style: ['vacation atmosphere', 'tropical setting', 'exotic backdrop', 'holiday vibe', 'cultural fusion']
  },
  chinese: {
    tone: ['elegant', 'sophisticated', 'refined', 'graceful', 'exotic'],
    phrases: ['Chinese beauty', 'elegant grace', 'refined charm', 'exotic elegance', 'sophisticated allure'],
    style: ['clean angles', 'elegant setting', 'refined atmosphere', 'polished look', 'graceful movement']
  },
  thai: {
    tone: ['exotic', 'tropical', 'warm', 'sensual', 'graceful'],
    phrases: ['Thai beauty', 'tropical warmth', 'exotic grace', 'sensual charm', 'oriental beauty'],
    style: ['tropical backdrop', 'exotic atmosphere', 'warm lighting', 'graceful movement', 'oriental aesthetic']
  },
  indonesian: {
    tone: ['warm', 'passionate', 'natural', 'exotic', 'tropical'],
    phrases: ['Indonesian beauty', 'tropical passion', 'natural charm', 'exotic allure', 'island warmth'],
    style: ['natural setting', 'tropical environment', 'warm tones', 'exotic backdrop', 'island life']
  },
  japanese: {
    tone: ['refined', 'shy', 'delicate', 'mysterious', 'elegant'],
    phrases: ['Japanese beauty', 'delicate charm', 'refined grace', 'mysterious allure', 'oriental elegance'],
    style: ['clean aesthetic', 'minimalist setting', 'delicate angles', 'refined atmosphere', 'zen-like calm']
  },
  korean: {
    tone: ['trendy', 'cute', 'stylish', 'modern', 'fresh'],
    phrases: ['Korean beauty', 'K-cute', 'trendy charm', 'modern allure', 'fresh style'],
    style: ['modern setting', 'trendy backdrop', 'clean aesthetic', 'K-beauty style', 'contemporary look']
  },
  skandal: {
    tone: ['secretive', 'forbidden', 'risky', 'scandalous', 'taboo'],
    phrases: ['caught on camera', 'secret recording', 'leaked footage', 'scandal revealed', 'hidden truth'],
    style: ['hidden camera', 'surveillance', 'phone recording', 'candid footage', 'secret capture']
  },
  default: {
    tone: ['natural', 'authentic', 'spontaneous', 'real', 'genuine'],
    phrases: ['real chemistry', 'no scripts', 'natural setting', 'authentic passion', 'genuine connection'],
    style: ['handheld footage', 'natural lighting', 'candid moments', 'raw energy', 'organic filming']
  }
};

const SCENE_NARRATIVE_TEMPLATES = [
  `This {adj} {type} video captures a {tone} encounter {location}. From the opening moments, the {adjective} {ethnicity} beauty radiates {tone2} energy as she {action_desc}. The {descriptor} setting adds an element of realism that makes this footage stand out among typical {category} content. Throughout the runtime, viewers are treated to {style} that showcases the natural chemistry between the participants. Whether you are a longtime fan of {ethnicity} content or new to the scene, this {quality} video delivers exactly what makes Malaysian amateur footage so compelling.`,

  `Experience the {tone} side of Malaysia with this {adj} {type} video {location}. The {ethnicity} beauty at the center of this scene brings {tone2} energy and {descriptor} appeal that keeps viewers coming back. Filmed with {style}, this {quality} {category} video captures every {adj2} moment in stunning detail. The {action_desc} sequence builds naturally, creating an immersive experience that feels far more genuine than typical {ethnicity} content found on mainstream sites.`,

  `{location}, the {ethnicity} beauty known for her {tone2} performances, delivers another {adj} {type} scene in this {quality} video. What sets this {category} footage apart is the {descriptor} atmosphere and {style} approach to filming. The {action_desc} sequence is the highlight of this video, showcasing the {tone} connection between the participants. For fans of authentic {ethnicity} content, this {type} video represents everything that makes Malaysian amateur videos so compelling — genuine passion, beautiful settings, and unforgettable {adjective} moments.`
];

const CATEGORY_ARTICLES = {
  hijab: {
    title: 'The Allure of Malay Hijab Content',
    body: 'There is something uniquely captivating about hijab content from Malaysia. The contrast between the modest exterior and the passionate moments captured on camera creates an irresistible tension. Malay hijab videos showcase the beauty of Muslim women who embrace both their faith and their natural desires. The shy glances, the nervous laughter, and the gradual surrender to passion make every hijab video an unforgettable experience. These real moments of vulnerability and desire are what set Malaysian hijab content apart from the rest of the Asian amateur scene.'
  },
  janda: {
    title: 'Why Janda Videos Are So Popular',
    body: 'Janda — the Malay word for widow — has become one of the most searched categories in Malaysian adult content. Janda videos feature mature women who bring years of experience and unbridled passion to their encounters. Unlike younger performers, janda know exactly what they want and are not afraid to take it. Their confident moves, combined with the natural beauty that Malaysian women seem to retain well into their 30s and 40s, make for some of the most compelling amateur content available online. The raw desire and experienced technique of janda videos create an unmatched viewing experience.'
  },
  couple: {
    title: 'Real Malaysian Couple Chemistry',
    body: 'The most compelling adult content comes from couples who genuinely care for each other, and Malaysian couples bring an extra layer of warmth and passion to their intimate moments. Couple videos from Malaysia showcase the loving dynamic between real partners — whether university sweethearts in their dorm room, newlyweds in their first apartment, or long-term couples keeping the spark alive. There is a tenderness in the way Malaysian girlfriends touch and please their partners that scripted content simply cannot replicate. These real couple experiences create content that resonates far more deeply than staged performances.'
  },
  solo: {
    title: 'Intimate Solo Moments',
    body: 'There is a unique intimacy in watching a beautiful woman explore her own pleasure. Solo videos from Malaysia offer viewers a private glimpse into the most personal moments of these women as they indulge in self-pleasure. Without the distraction of a partner, the focus remains entirely on the model — her reactions, her body, and her journey toward climax. These intimate self-exploration sessions are both sensual and empowering, showcasing the natural beauty and uninhibited passion of Malaysian women in their most private moments.'
  },
  group: {
    title: 'Group Passion: When More Is Better',
    body: 'Group scenes featuring Malaysian women represent some of the most intense content in the amateur category. Whether it is a threesome with two beautiful women, or a group party atmosphere, the energy of multiple participants creates a dynamic that is impossible to replicate in solo or couple scenes. Malaysian women in group settings showcase their naturally warm and giving nature. The collective passion, the synchronized movements, and the raw energy of group encounters make for unforgettable viewing.'
  },
  public: {
    title: 'The Thrill of Public Encounters',
    body: 'Public and outdoor content from Malaysia captures the raw thrill of intimacy in risky settings. From car park encounters to public toilet quickies, from beach sessions to rooftop adventures — the danger of being caught adds an electric tension to every moment. Malaysian public videos showcase couples and individuals who love the adrenaline rush of exhibitionism. The shaky camera, the whispered moans, the constant awareness of potential discovery — all of these elements combine to create content that is genuinely thrilling to watch.'
  },
  homemade: {
    title: 'Real. Raw. Unfiltered. The Magic of Homemade Videos',
    body: 'There is a special appeal to homemade videos that professional content cannot hope to replicate. The shaky camera work, the imperfect lighting, the whispered conversations in Bahasa — all of these elements combine to create content that feels genuinely authentic. These are real videos made by real people in real homes across Malaysia. The charm of homemade content lies in its vulnerability: the performers are not polished actresses, but real women sharing intimate moments with their partners. This authenticity is what draws viewers back again and again.'
  },
  student: {
    title: 'Campus Life: Student Videos from Malaysia',
    body: 'Student videos from Malaysian universities and colleges capture the youthful energy and uninhibited passion of young adults exploring their sexuality. From dorm room encounters to study session adventures, these videos showcase the vibrant intimate lives of Malaysian students. The casual settings — university hostels, cramped dorm rooms, campus nooks — add an authentic charm that polished productions cannot match. The youthful enthusiasm, genuine reactions, and spontaneous energy of student videos make them some of the most popular content in the Malaysian amateur scene.'
  },
  uniform: {
    title: 'After Hours: The Office Fantasy',
    body: 'There is something deeply appealing about the contrast between professional appearance and intimate behavior. Uniform and office videos from Malaysia feature women in their work attire — nurses, office workers, teachers — shedding their professional veneer for passionate encounters. The workplace setting, the uniforms, the tension of an after-hours rendezvous — all of these elements combine to create a uniquely Malaysian take on the office fantasy genre.'
  },
  chubby: {
    title: 'Celebrating Curvy Beauty',
    body: 'Chubby and curvy content from Malaysia celebrates the natural beauty of plus-size women who are confident in their bodies and unapologetic about their desires. These videos showcase women with curves in all the right places — thick thighs, full hips, and soft bellies that add an extra dimension to every encounter. The confidence and body positivity of chubby Malaysian women is infectious, creating content that is both sexually stimulating and body-positive. Their generous curves provide a different kind of visual pleasure that many viewers find irresistible.'
  },
  interracial: {
    title: 'East Meets West: The Interracial Fantasy',
    body: 'The fantasy of a foreign man connecting with a beautiful Malaysian woman is one of the most popular themes in adult content, and for good reason. The cultural dynamic between expats and Malaysian women creates a unique kind of chemistry — a meeting of worlds that is both exotic and deeply intimate. Malaysian women are renowned for their warmth, hospitality, and affectionate nature, qualities that translate perfectly into passionate encounters. Whether it is a tourist exploring local nightlife, an expat on a holiday romance, or a foreign worker finding connection abroad, the interracial dynamic produces some of the most genuinely passionate content available.'
  },
  skandal: {
    title: 'Leaked and Viral: The Scandal Factor',
    body: 'Scandal and leaked content from Malaysia carries an irresistible element of voyeurism and forbidden discovery. These videos — whether captured by hidden cameras, leaked from private collections, or shared through messaging apps — offer viewers the thrill of seeing something they were never meant to see. The raw, unedited nature of scandal content, combined with the genuine surprise and emotion of the participants, creates an authenticity that staged videos cannot match. The viral nature of these recordings, spreading through Telegram groups and WhatsApp chats before landing online, adds to their forbidden appeal.'
  },
  default: {
    title: 'Malaysian Amateur: The Real Deal',
    body: 'Malaysian amateur content stands out in the Asian adult scene for its authenticity and genuine passion. Unlike polished professional productions, real amateur videos from Malaysia capture spontaneous moments between people who share genuine chemistry. The natural beauty of Malaysian women — their warm skin, their dark eyes, their genuine smiles — combined with the unscripted passion of amateur encounters, creates content that feels refreshingly real. From budget hotel rooms to home bedrooms, these videos offer an unfiltered look at intimate life in Malaysia.'
  }
};

function getBank(category) {
  return CATEGORY_BANKS[category] || CATEGORY_BANKS.default;
}

function getCategoryNames(category) {
  return keywords.categories[category] || keywords.categories.default || ['Malay Amateur'];
}

function getTypes(category) {
  return keywords.types[category] || keywords.types.default;
}

function generateSceneNarrative(video) {
  const category = video._category || classifyVideo(video);
  const bank = getBank(category);
  const type = pick(getTypes(category));
  const adj = pick(keywords.adjectives);
  const adj2 = pick(keywords.adjectives);
  const adjective = pick(keywords.adjectives);
  const tone = pick(bank.tone);
  const tone2 = pick(bank.tone.filter(t => t !== tone));
  const style = pick(bank.style);
  const descriptor = pick(keywords.descriptors);
  const quality = pick(keywords.qualities);
  const ethnicity = pick(keywords.ethnicities);

  const locationMatch = video.title.match(/(?:in|at|dekat|dalam)\s+(.+?)(?:\s+(?:Hotel|Resort|Condo|Flat|Apartment|Villa|House|Bilik|Kampung|and|for|with|\.))/i);
  const location = locationMatch ? locationMatch[1] : pick(keywords.locations);

  const actionPhrases = {
    hijab: ['reveals her hidden passion', 'surrenders to forbidden desire', 'explores her secret side'],
    janda: ['takes control with experience', 'shows her mature expertise', 'leads with confidence'],
    couple: ['makes love passionately', 'embraces with real affection', 'shares intimate pleasure'],
    solo: ['explores her own body', 'pleasures herself slowly', 'indulges in self-love'],
    group: ['shares pleasure with all', 'takes center stage', 'becomes the center of attention'],
    public: ['dares to be intimate in public', 'takes the risk', 'pushes boundaries'],
    homemade: ['shares a private moment', 'captures real intimacy', 'films her secret passion'],
    student: ['discovers pleasure', 'gives in to youthful desire', 'explores her first times'],
    uniform: ['breaks the rules after hours', 'reveals her secret side', 'drops the professional act'],
    chubby: ['celebrates her curves', 'shows off her body', 'embraces her beauty'],
    interracial: ['connects with foreign passion', 'welcomes the visitor', 'shares cross-cultural romance'],
    chinese: ['shows her elegant side', 'reveals hidden desires', 'embraces passion'],
    thai: ['brings tropical warmth', 'shares exotic charm', 'delivers graceful passion'],
    indonesian: ['shares island warmth', 'reveals tropical passion', 'embraces natural desire'],
    japanese: ['shows delicate charm', 'reveals mysterious allure', 'embraces oriental passion'],
    korean: ['brings trendy charm', 'shows fresh style', 'delivers modern allure'],
    skandal: ['gets caught on camera', 'has a secret revealed', 'becomes the scandal'],
    default: ['gets intimate naturally', 'surrenders to passion', 'explores mutual desire']
  };
  const actionDesc = pick(actionPhrases[category] || actionPhrases.default);

  const template = pick(SCENE_NARRATIVE_TEMPLATES);

  const replacements = {
    '{adj}': adj === adj2 ? adj + ' ' + pick(['captivating', 'alluring', 'mesmerizing', 'breathtaking']) : adj,
    '{adj2}': adj2 === adj ? adj2 + ' ' + pick(['captivating', 'alluring', 'sensual']) : adj2,
    '{adjective}': adjective,
    '{tone}': tone,
    '{tone2}': tone2,
    '{type}': type,
    '{category}': category,
    '{ethnicity}': ethnicity,
    '{descriptor}': descriptor,
    '{quality}': quality,
    '{style}': style,
    '{location}': location,
    '{action_desc}': actionDesc
  };

  return template.replace(/\{(adj2?|adjective|tone2?|type|category|ethnicity|descriptor|quality|style|location|action_desc)\}/g,
    (m) => replacements[m] || m);
}

function generateCategoryArticle(category) {
  const article = CATEGORY_ARTICLES[category] || CATEGORY_ARTICLES.default;
  const categoryNames = getCategoryNames(category);
  const name = pick(categoryNames);
  return `<h2>${article.title}</h2>\n<p>${article.body.replace(/Malaysian|Malaysia|Malay/g, name).substring(0, 300)}...</p>`;
}

function generateRichDescription(video) {
  const category = video._category || classifyVideo(video);
  const bank = getBank(category);
  const types = getTypes(category) || getTypes('default');
  const type = pick(types);
  const adj = pick(keywords.adjectives);
  const ethnicity = pick(keywords.ethnicities);
  const descriptor = pick(keywords.descriptors);
  const quality = pick(keywords.qualities);
  const name = pick(keywords.melayuNames);
  const tagStr = (video.subTags || video.keywords || []).slice(0, 5).join(', ');
  const lsiTerms = pickN(bank.tone, 2).concat(pickN(bank.phrases, 1)).join(', ');
  const locationMatch = video.title.match(/(?:in|at|dekat|dalam)\s+(.+?)(?:\s+(?:Hotel|Resort|Condo|Flat|Apartment|Villa|House|Bilik|Kampung|and|for|with|\.))/i);
  const location = locationMatch ? locationMatch[1] : pick(keywords.locations);

  return `<p><strong>${video.title}</strong></p>
<p>Starring the stunning ${name}, this ${adj} ${type} video captures an unforgettable ${descriptor} encounter ${location}. The ${ethnicity} beauty at the center of this scene radiates ${bank.tone[0]} passion from the very first moment, creating an electric atmosphere that will keep you captivated throughout the entire runtime.</p>
<p>Shot in ${quality} with ${bank.style[0]}, every intimate detail is visible in stunning clarity. The ${lsiTerms} make this ${category} video stand out from typical content in this genre.</p>
<p>${tagStr ? 'Tags: ' + tagStr + '.' : ''} For more ${ethnicity.toLowerCase()} content featuring ${type} experiences, browse our full collection of authentic Malaysian amateur videos. Each video on xMelayu is carefully curated to provide the most genuine Southeast Asian amateur experience available online.</p>`;
}

function generateSEOText(video) {
  const category = video._category || classifyVideo(video);
  const tags = (video.subTags || video.keywords || []).filter(t => t.length > 2);
  const topTerms = pickN(tags, 5);
  const ethnicity = keywords.ethnicities.find(e => (video.title + ' ' + (video.keywords || []).join(' ')).toLowerCase().includes(e.toLowerCase())) || pick(keywords.ethnicities);
  const modelName = pick(keywords.melayuNames);

  const sections = [];

  if (category && CATEGORY_ARTICLES[category]) {
    const article = CATEGORY_ARTICLES[category];
    sections.push(`<h2>${article.title}</h2><p>${article.body.substring(0, 250)}...</p>`);
  }

  sections.push(`<h2>About This ${category || 'Video'}</h2>
<p>This ${category || 'amateur'} video features a beautiful ${ethnicity} model in a genuine ${category || 'amateur'} encounter. With ${pick(keywords.qualities)} quality, every passionate moment is captured in stunning detail. The natural chemistry between participants creates an authentic experience that represents the best of Malaysian adult content.</p>`);

  sections.push(`<h3>More ${ethnicity} Content</h3>
<p>Browse thousands of similar ${ethnicity.toLowerCase()} videos featuring real amateur models from across Southeast Asia. From passionate couple encounters to intimate solo performances, xMelayu offers the largest curated collection of authentic Malaysian adult content online. Our library covers every category including ${(keywords.categories[category] || []).slice(0, 3).join(', ')} and many more exclusive titles.</p>`);

  if (topTerms.length) {
    sections.push(`<p style="font-size:13px;color:#666">Related searches: ${topTerms.join(', ')}, ${ethnicity.toLowerCase()} amateur, melayu ${category || 'video'}, malay sex, asian adult content, malaysia amateur video.</p>`);
  }

  return sections.join('\n');
}

function generateRelatedText(currentVideo, relatedVideos) {
  if (!relatedVideos || !relatedVideos.length) return '';
  const picks = pickN(relatedVideos, 3);
  const items = picks.map(v =>
    `<a href="/${v.id}">${v.title}</a>`
  ).join(', ');
  return `<h3>You Might Also Like</h3><p>If you enjoyed this ${currentVideo._category || 'amateur'} video, check out more similar content: ${items}. Discover the full collection of authentic Malaysian amateur videos on xMelayu.</p>`;
}

function generateFullArticle(video, relatedVideos) {
  const category = classifyVideo(video);
  video._category = category;

  const narrative = generateSceneNarrative(video);
  const richDesc = generateRichDescription(video);
  const seoText = generateSEOText(video);
  const relatedText = generateRelatedText(video, relatedVideos);

  return {
    id: video.id,
    category,
    narrative,
    richDescription: richDesc,
    seoText,
    relatedText,
    fullHtml: `
<div class="nlp-article">
${richDesc}
${seoText}
<div class="nlp-narrative">
<h3>The Scene</h3>
${narrative}
</div>
${relatedText}
</div>`.trim()
  };
}

function generateAll(videos) {
  const articles = {};
  for (const video of videos) {
    const relatedVideos = videos.filter(v => v.id !== video.id && (v._category || classifyVideo(v)) === (video._category || classifyVideo(video))).slice(0, 6);
    articles[video.id] = generateFullArticle(video, relatedVideos);
  }
  return articles;
}

module.exports = {
  classifyVideo,
  generateSceneNarrative,
  generateCategoryArticle,
  generateRichDescription,
  generateRelatedText,
  generateSEOText,
  generateFullArticle,
  generateAll,
  extractKeywords
};
