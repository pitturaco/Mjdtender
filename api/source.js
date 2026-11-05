// /api/source?name=jobs|parc|ptenders&page=1  ->  { items:[...], done:bool, error? }
// يقرأ المواقع من جهة السيرفر (لا قيود CORS) ويخزّن الرد 30 دقيقة في كاش Vercel.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const GAZA = ['غزة', 'gaza', 'خان يونس', 'khan yun', 'رفح', 'rafah', 'دير البلح', 'deir al', 'جباليا', 'بيت لاهيا', 'بيت حانون', 'النصيرات', 'البريج', 'المغازي'];
const TYPES = [
  [/أمر\s*بيع|امر\s*بيع|مزايدة|مزاد|للبيع|auction|notice of sale/i, 'مزايدة وبيع'],
  [/استيراد|تصدير|import|export/i, 'استيراد وتصدير'],
  [/أمر\s*شراء|امر\s*شراء|أمر\s*توريد|امر\s*توريد|purchase order|supply order/i, 'أمر شراء وتوريد'],
  [/طلب\s*عروض\s*[أا]سعار|عرض\s*سعر|استدراج|\bRFQ\b|quotation/i, 'طلب عروض أسعار'],
  [/مقترحات|إبداء\s*الاهتمام|ابداء\s*الاهتمام|\bEOI\b|\bRFP\b|expression of interest|proposal/i, 'دعوة تقديم مقترحات'],
  [/مناقصة|\bITB\b|\btender\b/i, 'مناقصة'],
];
const SECTORS = [
  [/مياه|صرف\s*صحي|wash|water|sewage/i, 'مياه وصرف صحي'],
  [/دواء|أدوية|ادوية|طبي|مستشفى|صحة|الأدوات المساعدة|medical|health|pharma/i, 'صحة وأدوية'],
  [/زراع|دفيئ|بذور|أشتال|اشتال|ري\b|agri|seed|irrigation/i, 'زراعة وثروة حيوانية'],
  [/غذاء|غذائية|طرود|وجبات|دواجن|لحوم|food|meal|parcel/i, 'إغاثة وغذاء'],
  [/كهرباء|طاقة|مولد|وقود|solar|generator|fuel|electric/i, 'طاقة وكهرباء'],
  [/برمجة|حوسبة|تقنية|حاسوب|software|\bIT\b/i, 'تقنية معلومات'],
  [/إنشاء|انشاء|تأهيل|ترميم|بناء|صيانة|ركام|مقاول|construction|rehabilitation|renovation/i, 'إنشاءات وبنية تحتية'],
  [/سيارة|سيارات|مركبات|نقل|شحن|لوجست|vehicle|transport|logistic/i, 'نقل ومركبات'],
  [/قرطاسية|تعليم|مدرسة|school|education|stationery/i, 'تعليم وقرطاسية'],
  [/طباعة|دعاية|مطبوعات|printing/i, 'طباعة ودعاية'],
  [/استشار|تدقيق|تقييم|دراسة|تدريب|قاعة|ضيافة|consult|audit|evaluation|training/i, 'خدمات واستشارات'],
];
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, 'كانون الثاني': 1, 'يناير': 1, 'شباط': 2, 'فبراير': 2, 'آذار': 3, 'اذار': 3, 'مارس': 3, 'نيسان': 4, 'أبريل': 4, 'ابريل': 4, 'أيار': 5, 'ايار': 5, 'مايو': 5, 'حزيران': 6, 'يونيو': 6, 'تموز': 7, 'يوليو': 7, 'آب': 8, 'أغسطس': 8, 'اغسطس': 8, 'أيلول': 9, 'ايلول': 9, 'سبتمبر': 9, 'تشرين الأول': 10, 'تشرين الاول': 10, 'أكتوبر': 10, 'اكتوبر': 10, 'تشرين الثاني': 11, 'نوفمبر': 11, 'كانون الأول': 12, 'كانون الاول': 12, 'ديسمبر': 12 };
const MONRE = Object.keys(MON).sort((a, b) => b.length - a.length).join('|');
const pad = n => String(n).padStart(2, '0');
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

async function get(url, ms = 8000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8' }, signal: c.signal });
    return r.ok ? await r.text() : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}
const dec = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n));
const strip = h => dec(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
const h2s = html => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(x => clean(strip(x[1])));

function fin(d, mo, y) {
  if (!mo) return '';
  let yy = y ? +y : new Date().getFullYear();
  const dt = new Date(Date.UTC(yy, mo - 1, d));
  if (isNaN(dt) || dt.getUTCDate() !== d) return '';
  if (!y && dt < Date.now() - 120 * 864e5) yy++;
  return `${yy}-${pad(mo)}-${pad(d)}`;
}
function parseDate(t) {
  if (!t) return '';
  let m;
  if ((m = t.match(/\d{4}-\d{2}-\d{2}/))) return m[0];
  if ((m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if ((m = t.match(new RegExp('(\\d{1,2})\\s*[,،./\\- ]?\\s*(' + MONRE + ')[a-z]*\\.?\\s*[,،]?\\s*(\\d{4})?', 'i')))) return fin(+m[1], MON[m[2].toLowerCase()] || MON[m[2]], m[3]);
  if ((m = t.match(new RegExp('(' + MONRE + ')[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?', 'i')))) return fin(+m[2], MON[m[1].toLowerCase()] || MON[m[1]], m[3]);
  return '';
}
const findEnd = t => { const m = t.match(/(?:موعد\s*الإنتهاء|موعد\s*الانتهاء|آخر\s*موعد|الموعد\s*النهائي|deadline|closing date)([\s\S]{0,60})/i); return m ? parseDate(m[1]) : ''; };
const pick = (rules, t, d) => { for (const [re, v] of rules) if (re.test(t)) return v; return d; };
const isGaza = t => { t = (t || '').toLowerCase(); return GAZA.some(w => t.includes(w)); };
const sentence = (t, kw) => { const m = t.match(new RegExp('[^.\\n]{0,80}(?:' + kw + ')[^.\\n]{0,160}', 'i')); return m ? clean(m[0]) : ''; };
const grab = (t, lab) => { const m = t.match(new RegExp('(?:' + lab + ')\\s*[:：\\-–]?\\s*([^\\n|]{3,110})', 'i')); return m ? clean(m[1]) : ''; };

function details(text) {
  const t = text.slice(0, 8000), d = {};
  const funder = grab(t, 'الجهة\\s*الممولة|الممول|بتمويل\\s*من|ممول\\s*من|Donor|Funded by|Funding agency').split(/[،,]|\sوالذي|\sand implemented|\swhich/)[0].trim();
  const addr = grab(t, 'العنوان|Address|Location of submission').split(/[.؛;]\s|\sتلتزم/)[0].trim();
  let pay = grab(t, 'طريقة\\s*الدفع|شروط\\s*الدفع|Payment terms|Terms of payment');
  const pm = t.match(/الدفع[^\n]{0,220}?(خمسة\s*واربعون|ثلاثون|ستون|\d+)\s*(?:يوم|day)/i);
  if (!pay && pm) pay = 'خلال ' + ({ 'خمسة': 45, 'ثلاثون': 30, 'ستون': 60 }[pm[1].split(/\s/)[0]] || pm[1]) + ' يوماً من التسليم' + (/حوالة/.test(t) ? ' بحوالة بنكية' : '');
  const mail = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/), hand = /باليد|يدوي|بالظرف|ظرف|مُغلق|مغلق|مغلّف|hand[- ]?deliver|by hand|sealed|in person/i.test(t);
  const byMail = mail && /ترسل|يرسل|إرسال|ارسال|send|email|e-mail|البريد/i.test(t);
  const delivery = byMail && hand ? 'إلكتروني أو يدوي: ' + mail[0] : byMail ? 'إلكتروني: ' + mail[0] : hand ? 'يدوي (باليد / ظرف مغلق)' : '';
  const obtain = sentence(t, 'يمكن\\s*الحصول|للحصول\\s*على|استلام\\s*(?:الكراسة|الوثائق|وثائق)|كراسة\\s*الشروط|obtain|collect(?:ed)?\\s+the|download');
  const tm = t.match(/(?:until|before|by|حتى|قبل|الساعة)\s*(\d{1,2}[:.]\d{2})/i);
  Object.assign(d, { funder, addr, payment: pay, delivery, obtain, endTime: tm ? tm[1].replace('.', ':') : '' });
  Object.keys(d).forEach(k => !d[k] && delete d[k]);
  return d;
}
function hid(s) { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'x' + h.toString(16); }
function build(url, title, org, end, pub, locHint, text, src) {
  const blob = title + ' ' + text.slice(0, 500);
  let loc = isGaza(title + ' ' + locHint) ? 'قطاع غزة' : clean(locHint).slice(0, 30);
  if (!loc && isGaza(blob)) loc = 'قطاع غزة';
  return Object.assign({
    id: hid(url), title, org: org || 'راجع الإعلان', type: pick(TYPES, title + ' ' + text.slice(0, 400), 'عطاء'),
    sector: pick(SECTORS, title + ' ' + text.slice(0, 400), 'توريدات عامة'), loc, pub, end, url, src,
  }, details(text));
}

async function jobs(page) {
  const url = 'https://www.jobs.ps/tenders' + (page > 1 ? '?page=' + page : '');
  const html = await get(url);
  if (!html) return { items: [], done: true, error: 'jobs.ps غير متاح أو حجب الطلب' };
  const re = /<a\b[^>]*href=["']([^"']*\/tenders\/[^"'#?]+-\d+\.html)["'][^>]*>([\s\S]*?)<\/a>([\s\S]{0,400}?)(?=<a\b|$)/gi;
  const seen = new Set(), links = [];
  let m;
  while ((m = re.exec(html))) {
    const href = new URL(m[1], url).href, title = clean(strip(m[2]));
    if (!title || seen.has(href)) continue;
    seen.add(href); links.push({ href, title, tail: clean(strip(m[3])) });
  }
  if (!links.length) return { items: [], done: true };
  const items = (await Promise.all(links.map(async l => {
    const d = await get(l.href, 7000);
    let text = l.tail, end = parseDate(l.tail), org = '';
    if (d) { text = strip(d); org = h2s(d).find(h => h && h !== l.title && h.length < 120) || ''; end = findEnd(text) || end; }
    if (!end) return null;
    return build(l.href, l.title, org, end, '', l.tail.split(/\d/)[0], text, 'jobs.ps');
  }))).filter(Boolean);
  return { items, done: false };
}

async function parc(page) {
  const list = await get('https://pal-arc.org/ar/tenders');
  if (!list) return { items: [], done: true, error: 'pal-arc.org غير متاح' };
  const ids = [...list.matchAll(/single-tender\/(\d+)/g)].map(x => +x[1]);
  if (!ids.length) return { items: [], done: true };
  const from = Math.max(...ids) + 15 - (page - 1) * 30, range = [];
  for (let i = from; i > from - 30 && i > 0; i--) range.push(i);
  const items = (await Promise.all(range.map(async i => {
    const url = 'https://pal-arc.org/ar/single-tender/' + i, d = await get(url, 7000);
    if (!d) return null;
    const text = strip(d), tt = (d.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const title = clean(strip(tt)).split('|').pop().trim() || h2s(d)[0];
    const dates = text.match(/\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?/g) || [];
    if (!title || dates.length < 2) return null;
    const it = build(url, title, 'الإغاثة الزراعية الفلسطينية PARC', parseDate(dates[1]), parseDate(dates[0]), isGaza(title) ? 'قطاع غزة' : 'الضفة الغربية', text, 'pal-arc.org');
    if (dates[0].includes(' ')) it.pubTime = dates[0].split(' ')[1].slice(0, 5);
    if (dates[1].includes(' ')) it.endTime = dates[1].split(' ')[1].slice(0, 5);
    if (/RFQ/.test(text.slice(0, 700))) it.type = 'طلب عروض أسعار';
    return it;
  }))).filter(Boolean);
  return { items, done: page >= 6 };
}

// مواقع إضافية: أضف هنا أي موقع (رابط القائمة + نمط روابط الإعلانات)
const SOURCES = {
  ptenders: { name: 'palestinetenders.com', listing: 'https://www.palestinetenders.com/', pattern: /\/tender\/[^"'#?]+\.php/ },
};
async function generic(cfg) {
  const html = await get(cfg.listing);
  if (!html) return { items: [], done: true, error: cfg.name + ' غير متاح' };
  const re = new RegExp('<a\\b[^>]*href=["\']([^"\']*' + cfg.pattern.source + ')["\'][^>]*>([\\s\\S]*?)<\\/a>([\\s\\S]{0,300}?)(?=<a\\b|$)', 'gi');
  const seen = new Set(), links = [];
  let m;
  while ((m = re.exec(html))) {
    const href = new URL(m[1], cfg.listing).href, title = clean(strip(m[2]));
    if (!title || seen.has(href)) continue;
    seen.add(href); links.push({ href, title, tail: clean(strip(m[3])) });
  }
  const items = (await Promise.all(links.slice(0, 40).map(async l => {
    const d = await get(l.href, 7000);
    const text = d ? strip(d) : l.tail, end = findEnd(text) || parseDate(l.tail);
    return end ? build(l.href, l.title, '', end, '', '', text, cfg.name) : null;
  }))).filter(Boolean);
  return { items, done: true };
}

module.exports = async (req, res) => {
  const name = String(req.query.name || ''), page = Math.max(1, parseInt(req.query.page || '1', 10));
  let out;
  try {
    out = name === 'jobs' ? await jobs(page) : name === 'parc' ? await parc(page) : SOURCES[name] ? await generic(SOURCES[name]) : { items: [], done: true, error: 'مصدر غير معروف' };
  } catch (e) { out = { items: [], done: true, error: String(e) }; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', out.error ? 'no-store' : 'public, s-maxage=1800, stale-while-revalidate=3600');
  res.status(200).send(JSON.stringify(out));
};
module.exports._t = { parseDate, findEnd, details, build, strip, pick, TYPES };
