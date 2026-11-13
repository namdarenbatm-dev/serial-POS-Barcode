(function () {
  'use strict';
  var C = window.SBCore, Auth = window.BPAuth, $ = function (id) { return document.getElementById(id); };
  var KEY = 'sbd.rules.v2', MKEY = 'sbd.macro.v1', RKEY = 'bp.remember.v1', PAGE = 200, SPLASH_MS = 8000;
  var DEFAULT_RULES = [];
  var rules = loadRules(), table = null, rowsCache = {}, serials = [], res = null, filter = 'all', shown = PAGE, deferredInstall = null;

  /* ---------- آیکن‌ها (SVG داخلی) ---------- */
  var ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    part: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>',
    q: '<circle cx="12" cy="12" r="8"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.6"/><path d="M12 16.8v.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.3v.01"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.7a9.7 9.7 0 0 1 1.4-.2C18.4 5.5 22 12 22 12a17 17 0 0 1-3.2 4M6.2 7.2A17 17 0 0 0 2 12s3.6 6.5 10 6.5c1.5 0 2.9-.3 4.1-.8"/>',
    dup: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'
  };
  function ic(n) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  /* ---------- ابزار ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nf(n) { return Number(n).toLocaleString('fa-IR'); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  var tt;
  function toast(msg, err) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, err ? 7000 : 3000);
  }
  function download(name, data, type) {
    var url = URL.createObjectURL(new Blob([data], { type: type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function brandClass(b) {
    b = String(b || '').toLowerCase();
    return b.indexOf('pax') >= 0 ? 'b-pax' : b.indexOf('verifone') >= 0 ? 'b-ver' : b.indexOf('newland') >= 0 ? 'b-new' : 'b-oth';
  }
  var BRAND_COLOR = { 'b-pax': 'var(--blue)', 'b-ver': 'var(--leaf)', 'b-new': 'var(--orange)', 'b-oth': 'var(--ink-3)' };
  function loadRules() {
    try { var s = localStorage.getItem(KEY); if (s) { var j = JSON.parse(s); if (Array.isArray(j)) return j; } } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_RULES));
  }
  function saveRules() { try { localStorage.setItem(KEY, JSON.stringify(rules)); } catch (e) {} }

  /* ---------- اسپلش (۸ ثانیه) و ورود ---------- */
  function startSplash() {
    setTimeout(function () {
      var sp = $('splash'); sp.classList.add('out'); document.body.classList.remove('is-splash');
      setTimeout(function () { sp.hidden = true; afterSplash(); }, 460);
    }, SPLASH_MS);
  }
  function remembered() { try { return localStorage.getItem(RKEY) === Auth.HASH; } catch (e) { return false; } }
  function afterSplash() { if (remembered()) showApp(); else showLogin(); }
  function showLogin() { $('app').hidden = true; $('login').hidden = false; $('pw').value = ''; $('pwErr').hidden = true; setTimeout(function () { $('pw').focus(); }, 50); }
  function showApp() { $('login').hidden = true; $('app').hidden = false; window.scrollTo(0, 0); }
  function logout() {
    try { localStorage.removeItem(RKEY); } catch (e) {}
    table = null; rowsCache = {}; serials = []; res = null; $('paste').value = ''; $('resCard').hidden = true; $('pickRow').hidden = true;
    showLogin();
  }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('pw').value, err = $('pwErr'), card = $('loginForm');
    if (!pw) { err.textContent = 'رمز عبور را وارد کنید.'; err.hidden = false; $('pw').focus(); return; }
    Auth.verify(pw).then(function (ok) {
      if (ok) {
        try { if ($('remember').checked) localStorage.setItem(RKEY, Auth.HASH); else localStorage.removeItem(RKEY); } catch (x) {}
        showApp();
      } else {
        err.textContent = 'رمز اشتباه است. دوباره امتحان کنید.'; err.hidden = false;
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        $('pw').select();
      }
    });
  });
  $('pwToggle').innerHTML = ic('eye');
  $('pwToggle').addEventListener('click', function () {
    var show = $('pw').type === 'password';
    $('pw').type = show ? 'text' : 'password'; this.setAttribute('aria-pressed', show); this.setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
    this.innerHTML = ic(show ? 'eyeoff' : 'eye');
  });
  $('logoutBtn').addEventListener('click', logout);

  /* ---------- شیشه‌ی اسکنر: نماد بارکد ---------- */
  (function () {
    var pairs = [[3, 2], [1, 1], [2, 2], [1, 3], [4, 2], [1, 1], [2, 1], [3, 2], [1, 2], [2, 1], [3, 2], [1, 1], [4, 0]], x = 0, s = '';
    pairs.forEach(function (p) { s += '<rect x="' + x + '" y="0" width="' + p[0] + '" height="28" rx=".5"/>'; x += p[0] + p[1]; });
    $('glyph').innerHTML = '<svg viewBox="0 0 ' + x + ' 28" preserveAspectRatio="none">' + s + '</svg>';
  })();

  /* ---------- ورودی فایل ---------- */
  function readBuf(f) {
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { no(new Error('خواندن فایل ممکن نشد.')); }; r.readAsArrayBuffer(f); });
  }
  function importMsg(msg, bad) { var el = $('importMsg'); el.textContent = msg || ''; el.hidden = !msg; el.className = 'import-msg' + (bad ? ' bad' : ''); }
  async function handleFile(f) {
    if (!f) return;
    importMsg('در حال خواندن «' + f.name + '»…');
    try {
      table = await C.openTable(await readBuf(f), f.name);
      rowsCache = {};
      var sel = $('sheetSel'); sel.innerHTML = '';
      table.names.forEach(function (n, i) { var o = document.createElement('option'); o.value = i; o.textContent = n; sel.appendChild(o); });
      $('fileInfo').textContent = 'فایل: ' + f.name;
      await loadSheet(0);
      importMsg('');
    } catch (e) { table = null; importMsg((e && e.message) || String(e), true); toast((e && e.message) || String(e), true); }
  }
  async function getRows(i) { if (!rowsCache[i]) rowsCache[i] = await table.getRows(i); return rowsCache[i]; }
  async function loadSheet(i) {
    var rows = await getRows(i);
    if (!rows.length) { toast('این شیت خالی است. شیت دیگری را انتخاب کنید.', true); return; }
    var det = C.detectColumn(rows), cs = $('colSel'); cs.innerHTML = '';
    for (var c = 0; c <= det.maxCol; c++) {
      var sample = ''; for (var r = 0; r < Math.min(rows.length, 4); r++) if (rows[r][c] != null && !sample) sample = String(rows[r][c]);
      var o = document.createElement('option'); o.value = c;
      o.textContent = 'ستون ' + C.colName(c) + (sample ? ' — ' + sample.slice(0, 18) : ''); cs.appendChild(o);
    }
    cs.value = det.col; $('hdrChk').checked = det.header; $('pickRow').hidden = false;
    await runFromTable();
  }
  async function runFromTable() {
    if (!table) return;
    var rows = await getRows(+$('sheetSel').value), col = +$('colSel').value, start = $('hdrChk').checked ? 1 : 0;
    serials = []; for (var i = start; i < rows.length; i++) if (rows[i] && rows[i][col] != null) serials.push(rows[i][col]);
    run();
  }
  function runFromPaste() {
    table = null; $('pickRow').hidden = true; $('fileInfo').textContent = '';
    serials = $('paste').value.split(/\r?\n/);
    run();
  }

  /* ---------- تحلیل و نمایش ---------- */
  function run() {
    res = C.analyze(serials, rules, { macro: $('macroChk').checked });
    shown = PAGE;
    if (!res.summary.total) { $('resCard').hidden = true; toast('سریالی پیدا نشد. ستون یا ردیف عنوان را بررسی کنید.', true); return; }
    $('resCard').hidden = false;
    renderStrip(); renderStats(); renderDonut(); renderModelBars(); renderHist(); renderFilters(); renderTable(); renderUnknown(); updateExpCount();
    $('resCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* نوار بارکدی: عرض میله‌ها متناسب با تعداد هر وضعیت */
  function renderStrip() {
    var s = res.summary, bad = s.invalid + s.conflict;
    var segs = [['ok', s.ok, 'شناسایی‌شده'], ['partial', s.partial, 'فقط برند'], ['unknown', s.unknown, 'ناشناخته'], ['bad', bad, 'نامعتبر یا تداخل']].filter(function (x) { return x[1] > 0; });
    var N = 110, widths = [1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3], x = 0, bi = 0, out = '';
    segs.forEach(function (sg) {
      var cnt = Math.max(1, Math.round(sg[1] / s.total * N));
      for (var k = 0; k < cnt; k++) { var w = widths[(bi * 7 + 3) % widths.length]; bi++; out += '<rect class="b-' + sg[0] + '" x="' + x.toFixed(2) + '" y="0" width="' + w + '" height="64" rx=".3"/>'; x += w + 1.2; }
    });
    $('stripWrap').innerHTML = '<svg viewBox="0 0 ' + x.toFixed(2) + ' 64" preserveAspectRatio="none">' + out + '</svg>' +
      '<ul class="legend">' + segs.map(function (sg) {
        return '<li><i class="sw b-' + sg[0] + '" style="background:var(--' + ({ ok: 'leaf', partial: 'blue', unknown: 'orange', bad: 'red' }[sg[0]]) + ')"></i>' + sg[2] + ' · ' + nf(sg[1]) + ' (' + nf(pct(sg[1], s.total)) + '٪)</li>';
      }).join('') + '</ul>';
  }
  function renderStats() {
    var s = res.summary, items = [['کل سریال', s.total], ['شناسایی‌شده', s.ok], ['فقط برند', s.partial], ['ناشناخته', s.unknown], ['نامعتبر', s.invalid], ['تداخل قانون', s.conflict], ['تکراری', s.dup]];
    $('stats').innerHTML = items.filter(function (x, i) { return i === 0 || x[1] > 0; }).map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + nf(x[1]) + '</dd></div>'; }).join('');
  }

  /* دونات: سهم برندها */
  function renderDonut() {
    var cnt = {}, total = 0;
    res.rows.forEach(function (r) { if (r.status === 'invalid') return; var b = r.brand || 'نامشخص'; cnt[b] = (cnt[b] || 0) + 1; total++; });
    var list = Object.keys(cnt).map(function (b) { return { b: b, n: cnt[b] }; }).sort(function (a, b) { return b.n - a.n; });
    if (list.length > 5) { var rest = list.slice(4).reduce(function (a, x) { return a + x.n; }, 0); list = list.slice(0, 4).concat([{ b: 'سایر', n: rest }]); }
    var off = 0, rings = '';
    list.forEach(function (x) {
      var p = x.n / total * 100, col = x.b === 'نامشخص' || x.b === 'سایر' ? 'var(--ink-3)' : BRAND_COLOR[brandClass(x.b)];
      x.col = col; x.op = x.b === 'نامشخص' ? .45 : 1;
      rings += '<circle class="ring" cx="21" cy="21" r="15.9155" transform="rotate(-90 21 21)" style="stroke:' + col + '" stroke-opacity="' + x.op + '" stroke-dasharray="' + Math.max(0, p - (list.length > 1 ? .8 : 0)).toFixed(2) + ' ' + (100 - Math.max(0, p - (list.length > 1 ? .8 : 0))).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
      off += p;
    });
    $('donut').innerHTML = '<svg viewBox="0 0 42 42" role="img" aria-label="سهم برندها">' + rings +
      '<text x="21" y="22" text-anchor="middle" font-size="7.4">' + nf(total) + '</text><text x="21" y="27.4" text-anchor="middle" font-size="2.9" style="fill:var(--ink-3)">سریال</text></svg>' +
      '<ul class="dl">' + list.map(function (x) {
        return '<li><i class="sw" style="background:' + x.col + ';opacity:' + x.op + '"></i><span>' + esc(x.b) + '</span><span class="n">' + nf(x.n) + ' · ' + nf(pct(x.n, total)) + '٪</span></li>';
      }).join('') + '</ul>';
  }

  /* میله‌های مدل */
  function renderModelBars() {
    var m = res.summary.models.slice(0, 10), max = m.length ? m[0].count : 1, tot = res.summary.ok + res.summary.partial;
    $('modelBars').innerHTML = m.length ? m.map(function (x) {
      var cls = brandClass(x.brand), label = x.model === '—' ? x.brand : x.brand + ' ' + x.model;
      return '<div class="mb ' + cls + '"><span class="lab" title="' + esc(label) + '">' + esc(label) + '</span><span class="track"><i style="width:' + Math.max(2, x.count / max * 100) + '%"></i></span><span class="val">' + nf(x.count) + ' · ' + nf(pct(x.count, tot)) + '٪</span></div>';
    }).join('') : '<p class="muted">هنوز مدلی شناسایی نشده است.</p>';
  }

  /* هیستوگرام طول سریال: شناسایی‌شده در برابر شناسایی‌نشده */
  function renderHist() {
    var by = {}, max = 1;
    res.rows.forEach(function (r) { var L = r.serial.length, o = by[L] = by[L] || { ok: 0, no: 0 }; if (r.status === 'ok' || r.status === 'partial') o.ok++; else o.no++; max = Math.max(max, o.ok + o.no); });
    var H = 128;
    $('hist').innerHTML = Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (L) {
      var o = by[L], tot = o.ok + o.no, h = Math.max(6, Math.round(tot / max * H)), hn = Math.round(h * o.no / tot), ho = h - hn;
      return '<div class="hcol" title="طول ' + L + ': ' + o.ok + ' شناسایی‌شده، ' + o.no + ' شناسایی‌نشده"><div class="stack" style="height:' + H + 'px"><i class="s-no" style="height:' + hn + 'px"></i><i class="s-ok" style="height:' + ho + 'px"></i></div><b>' + nf(tot) + '</b><span>' + nf(L) + ' رقم</span></div>';
    }).join('');
    var key = $('hist').parentNode.querySelector('.hist-key');
    if (!key) { key = document.createElement('div'); key.className = 'hist-key'; key.innerHTML = '<span><i class="sw" style="background:var(--leaf)"></i> شناسایی‌شده</span><span><i class="sw" style="background:var(--orange)"></i> شناسایی‌نشده</span>'; $('hist').parentNode.appendChild(key); }
  }

  /* فیلترها */
  var FILTERS = [['all', 'همه'], ['ok', 'شناسایی‌شده'], ['partial', 'فقط برند'], ['unknown', 'ناشناخته'], ['invalid', 'نامعتبر'], ['conflict', 'تداخل'], ['dup', 'تکراری']];
  function renderFilters() {
    var c = { all: res.rows.length, dup: res.summary.dup, ok: res.summary.ok, partial: res.summary.partial, unknown: res.summary.unknown, invalid: res.summary.invalid, conflict: res.summary.conflict };
    if (!c[filter] && filter !== 'all') filter = 'all';
    $('filters').innerHTML = FILTERS.filter(function (f) { return f[0] === 'all' || c[f[0]] > 0; }).map(function (f) {
      return '<button class="f" data-f="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + '<span class="c">' + nf(c[f[0]]) + '</span></button>';
    }).join('');
  }
  function filtered() {
    var q = C.normalizeSerial($('q').value), qt = $('q').value.trim().toLowerCase();
    return res.rows.filter(function (r) {
      if (filter === 'dup' ? !r.dup : filter !== 'all' && r.status !== filter) return false;
      if (!qt) return true;
      return r.serial.indexOf(q) >= 0 || r.brand.toLowerCase().indexOf(qt) >= 0 || r.model.toLowerCase().indexOf(qt) >= 0;
    });
  }

  /* جدول نتایج: آواتار برند، چیپ مدل، پیل وضعیت، قانون */
  var ST_ICON = { ok: 'check', partial: 'part', unknown: 'q', invalid: 'x', conflict: 'warn' };
  function ruleCell(r) {
    if (!r.rule) return '<span class="muted">—</span>';
    var h, m = /(?:طول (\d+)|هر طول) \+ پیشوند (\S+)/.exec(r.rule);
    if (r.rule.indexOf('پچ: ') === 0) h = '<span class="src">پچ</span>' + (m ? '<span class="pat">' + (m[1] ? nf(m[1]) + ' · ' : '') + esc(m[2]) + '</span>' : '');
    else h = '<span class="src">شخصی</span><span class="pat">' + esc(r.rule.split(' (تداخل')[0]) + '</span>';
    if (r.rule.indexOf('برند از روی مدل') >= 0) h += '<span class="note" title="پچ برای این سریال برند نمی‌دهد. برند از روی مدل حدس زده شد.">برند حدسی</span>';
    if (r.rule.indexOf('⚠') >= 0) h += '<span class="note bad" title="در پچ، تابع برند و تابع مدل برای این سریال جواب‌های ناسازگار می‌دهند.">ناسازگار</span>';
    if (r.rule.indexOf('صفر ابتدای') >= 0) h += '<span class="note" title="فرض شد Excel صفر ابتدای سریال را حذف کرده است.">صفر اضافه شد</span>';
    if (r.rule.indexOf('(تداخل با') >= 0) h += '<span class="note bad" title="' + esc(r.rule) + '">تداخل</span>';
    return '<span class="rule">' + h + '</span>';
  }
  function renderTable() {
    var list = filtered(), slice = list.slice(0, shown);
    $('resTbl').tBodies[0].innerHTML = slice.map(function (r) {
      var cls = brandClass(r.brand), pm = /پیشوند (\S+)/.exec(r.rule), sn = esc(r.serial);
      if (pm && r.serial.indexOf(pm[1]) === 0) sn = '<mark>' + esc(pm[1]) + '</mark>' + esc(r.serial.slice(pm[1].length));
      var brand = r.brand ? '<span class="brandcell ' + cls + '"><span class="av">' + esc(r.brand.charAt(0).toUpperCase()) + '</span>' + esc(r.brand) + '</span>' : '<span class="muted">—</span>';
      var model = r.model ? '<span class="mdl ' + cls + '">' + esc(r.model) + '</span>' : '<span class="muted">—</span>';
      return '<tr><td class="num">' + nf(r.n) + '</td><td class="sn">' + sn + '</td><td>' + brand + '</td><td>' + model + '</td><td><span class="pill ' + r.status + '">' + ic(ST_ICON[r.status]) + C.STATUS_FA[r.status] + '</span>' +
        (r.dup ? '<span class="pill dup">' + ic('dup') + 'تکراری</span>' : '') + '</td><td>' + ruleCell(r) + '</td></tr>';
    }).join('');
    $('more').hidden = list.length <= shown;
    $('pageInfo').textContent = 'نمایش ' + nf(Math.min(shown, list.length)) + ' از ' + nf(list.length);
  }
  function renderUnknown() {
    var p = res.summary.prefixList;
    $('unkBox').hidden = !p.length;
    $('unk').innerHTML = p.map(function (x) {
      return '<div><span class="pf">' + esc(x.prefix) + '</span><span>طول ' + nf(x.len) + ' · ' + nf(x.count) + ' سریال، نمونه: <bdi dir="ltr" class="sn">' + esc(x.sample) + '</bdi></span><button class="btn" data-mk="' + esc(x.prefix) + '" data-len="' + x.len + '">ساخت قانون</button></div>';
    }).join('');
  }

  /* ---------- قوانین ---------- */
  function renderRules(focusLast) {
    var tb = $('rulesTbl').tBodies[0];
    tb.innerHTML = rules.map(function (r, i) {
      var comp = C.compileRules([r])[0], bad = comp && !comp.ok;
      return '<tr data-i="' + i + '"><td><input type="checkbox" data-k="enabled"' + (r.enabled !== false ? ' checked' : '') + ' aria-label="فعال"></td>' +
        '<td><input data-k="brand" value="' + esc(r.brand) + '" placeholder="PAX" aria-label="برند"></td>' +
        '<td><input data-k="model" value="' + esc(r.model) + '" placeholder="D230" aria-label="مدل"></td>' +
        '<td><select data-k="type" aria-label="نوع"><option value="prefix"' + (r.type === 'prefix' ? ' selected' : '') + '>پیشوند</option><option value="range"' + (r.type === 'range' ? ' selected' : '') + '>رنج</option><option value="regex"' + (r.type === 'regex' ? ' selected' : '') + '>الگو (regex)</option></select></td>' +
        '<td><input class="sn' + (bad ? ' bad' : '') + '" data-k="a" value="' + esc(r.a) + '"' + (bad ? ' title="' + esc(comp.err) + '"' : '') + ' aria-label="از یا پیشوند"></td>' +
        '<td><input class="sn' + (bad ? ' bad' : '') + '" data-k="b" value="' + esc(r.b || '') + '"' + (r.type !== 'range' ? ' disabled' : '') + ' aria-label="تا"></td>' +
        '<td><input data-k="len" value="' + esc(r.len || '') + '" style="width:64px" inputmode="numeric" placeholder="—" aria-label="طول"></td>' +
        '<td><input data-k="note" value="' + esc(r.note || '') + '" aria-label="توضیح"></td>' +
        '<td><button class="rm" data-rm="' + i + '" aria-label="حذف قانون" title="حذف">' + ic('trash') + '</button></td></tr>';
    }).join('') || '<tr><td colspan="9" class="muted" style="padding:16px">قانون شخصی ندارید. با «افزودن قانون» یکی بسازید.</td></tr>';
    if (focusLast) { var inp = tb.querySelectorAll('tr:last-child input[data-k=brand]')[0]; if (inp) inp.focus(); }
  }
  var rerun = debounce(function () { if (serials.length) run(); }, 250);
  function addRule(prefix, len) {
    rules.push({ enabled: true, brand: '', model: '', type: 'prefix', a: prefix || '', b: '', len: len || '', note: '' });
    saveRules(); renderRules(true);
    $('rulesSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* جدول قوانین پچ: طول، مدل، پیشوندها به‌صورت چیپ */
  function modelBrand(m) { return m === 'Verifone' ? 'Verifone' : m === 'SP600' ? 'Newland' : 'PAX'; }
  function renderMacroTable() {
    var M = C.MACRO; if (!M) return;
    var rows = [];
    Object.keys(M.model.byLen).sort(function (a, b) { return a - b; }).forEach(function (L) {
      var last = {}, g = {}; M.model.byLen[L].forEach(function (e) { last[e[0]] = e[1]; });
      Object.keys(last).forEach(function (p) { (g[last[p]] = g[last[p]] || []).push(p); });
      Object.keys(g).forEach(function (m) {
        var cls = brandClass(modelBrand(m));
        rows.push('<tr><td><span class="lenb">' + nf(L) + '</span></td><td><span class="mdl ' + cls + '">' + esc(m === 'Verifone' ? 'Verifone (بدون مدل)' : m) + '</span></td><td>' +
          g[m].map(function (p) { return '<span class="pf ' + cls + '">' + esc(p) + '</span>'; }).join('') + '</td></tr>');
      });
    });
    $('macroTbl').tBodies[0].innerHTML = rows.join('');
  }

  /* ---------- رویدادها ---------- */
  var drop = $('drop'), fileIn = $('file');
  drop.addEventListener('click', function (e) { if (e.target !== fileIn) fileIn.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener('change', function () { handleFile(fileIn.files[0]); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { handleFile(e.dataTransfer.files[0]); });
  function guard(p) { return p.catch(function (e) { importMsg((e && e.message) || String(e), true); }); }
  $('sheetSel').addEventListener('change', function () { guard(loadSheet(+this.value)); });
  $('colSel').addEventListener('change', function () { guard(runFromTable()); });
  $('hdrChk').addEventListener('change', function () { guard(runFromTable()); });
  $('pasteGo').addEventListener('click', runFromPaste);

  $('filters').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; shown = PAGE; renderFilters(); renderTable(); updateExpCount(); });
  $('q').addEventListener('input', debounce(function () { shown = PAGE; renderTable(); updateExpCount(); }, 150));
  $('more').addEventListener('click', function () { shown += PAGE; renderTable(); });
  $('unk').addEventListener('click', function (e) { var b = e.target.closest('[data-mk]'); if (b) addRule(b.dataset.mk, b.dataset.len); });

  /* ---------- خروجی هر تب ---------- */
  var XLSX_T = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var FILE_KEY = { all: 'all', ok: 'identified', partial: 'brand-only', unknown: 'unknown', invalid: 'invalid', conflict: 'conflict', dup: 'duplicates' };
  function tabName(k) { for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i][0] === k) return FILTERS[i][1]; return k; }
  function rowsOfTab(k) { return res.rows.filter(function (r) { return k === 'dup' ? r.dup : k === 'all' || r.status === k; }); }
  /* همان چیزی که در جدول می‌بینید: تب انتخاب‌شده + جستجو */
  function currentRows() { return filtered(); }
  function currentSheets() { return [C.tabSheet(currentRows(), tabName(filter))]; }
  function allTabSheets() {
    var sh = [], s = res.summary, c = { ok: s.ok, partial: s.partial, unknown: s.unknown, invalid: s.invalid, conflict: s.conflict, dup: s.dup };
    sh.push(C.tabSheet(res.rows, 'همه'));
    ['ok', 'partial', 'unknown', 'invalid', 'conflict', 'dup'].forEach(function (k) { if (c[k] > 0) sh.push(C.tabSheet(rowsOfTab(k), tabName(k))); });
    sh.push(C.resultSheets(res)[1]);
    return sh;
  }
  function buildCurrent() { return { sheets: currentSheets(), name: 'barcode-pos-' + FILE_KEY[filter] + '-' + stamp() + '.xlsx', count: currentRows().length }; }
  function buildAll() { return { sheets: allTabSheets(), name: 'barcode-pos-all-tabs-' + stamp() + '.xlsx', count: res.rows.length }; }
  function updateExpCount() { var n = res ? currentRows().length : 0; $('expCnt').textContent = res ? 'تب «' + tabName(filter) + '»: ' + nf(n) + ' ردیف' : ''; $('expXlsx').disabled = !n; $('expCsv').disabled = !n; }

  $('expXlsx').addEventListener('click', function () {
    if (!res) return;
    var b = buildCurrent();
    if (!b.count) return toast('در این تب ردیفی برای خروجی نیست.', true);
    download(b.name, C.buildXlsx(b.sheets), XLSX_T);
    toast('خروجی تب «' + tabName(filter) + '» با ' + nf(b.count) + ' ردیف ساخته شد.');
  });
  $('expAll').addEventListener('click', function () { if (!res) return; var b = buildAll(); download(b.name, C.buildXlsx(b.sheets), XLSX_T); toast('خروجی همه تب‌ها ساخته شد.'); });
  $('expCsv').addEventListener('click', function () {
    if (!res) return;
    var s = currentSheets()[0];
    download('barcode-pos-' + FILE_KEY[filter] + '-' + stamp() + '.csv', C.toCsv(s.header, s.rows), 'text/csv;charset=utf-8');
  });

  /* ---------- ارسال به کارگزار ---------- */
  var dlg = $('sendDlg'), mailAuto = false;
  function toB64(u8) { var s = '', i, n = 0x8000; for (i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  $('sendBtn').addEventListener('click', function () {
    if (!res) return;
    $('brokerMail').value = lsGet('bp.broker.v1');
    $('sendScope').value = 'tab';
    var canFile = !!(navigator.canShare && navigator.share);
    mailAuto = false; $('keyRow').hidden = true; $('sendKey').value = lsGet('bp.sendkey.v1');
    fetch('api/health', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.mail) { mailAuto = true; $('keyRow').hidden = false; $('sendHelp').textContent = 'ارسال خودکار از طریق سرور روشن است: فایل بدون هیچ مرحله‌ی دستی به ایمیل کارگزار می‌رسد.'; $('sendGo').textContent = 'ارسال به کارگزار'; }
    }).catch(function () {});
    $('sendGo').textContent = 'آماده‌سازی و ارسال';
    $('sendHelp').textContent = canFile
      ? 'روی این دستگاه، فایل Excel همراه پیام به برنامه‌ی ایمیل شما داده می‌شود و فقط باید ارسال را بزنید.'
      : 'مرورگر شما پیوست خودکار را پشتیبانی نمی‌کند. فایل دانلود می‌شود و ایمیل آماده باز می‌شود؛ فقط فایل دانلودشده را پیوست کنید.';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('sendCancel').addEventListener('click', function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
  $('sendForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var to = $('brokerMail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return toast('ایمیل کارگزار درست نیست.', true);
    lsSet('bp.broker.v1', to);
    var b = $('sendScope').value === 'all' ? buildAll() : buildCurrent();
    if (!b.count) return toast('در این تب ردیفی برای ارسال نیست.', true);
    var s = res.summary, note = $('sendNote').value.trim();
    var subject = 'خروجی سریال کارتخوان - ' + stamp();
    var body = 'سلام،\n\nفایل Excel تشخیص سریال کارتخوان پیوست است.\n' +
      (b.name.indexOf('all-tabs') >= 0 ? 'محتوا: همه تب‌ها' : 'محتوا: تب «' + tabName(filter) + '»') + ' (' + b.count + ' ردیف)\n' +
      'کل سریال‌ها: ' + s.total + '، شناسایی‌شده: ' + s.ok + '، ناشناخته: ' + s.unknown + '\n' + (note ? '\n' + note + '\n' : '') + '\nبا احترام';
    var bytes = C.buildXlsx(b.sheets), file = null;
    try { file = new File([bytes], b.name, { type: XLSX_T }); } catch (err) {}
    if (mailAuto) {
      var key = $('sendKey').value.trim(); if (!key) return toast('کلید ارسال را وارد کنید.', true);
      lsSet('bp.sendkey.v1', key);
      var goBtn = $('sendGo'); goBtn.disabled = true; goBtn.textContent = 'در حال ارسال…';
      fetch('api/send', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Send-Key': key },
        body: JSON.stringify({ to: to, subject: subject, body: body, filename: b.name, data: toB64(new Uint8Array(bytes)) }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          goBtn.disabled = false; goBtn.textContent = 'ارسال به کارگزار';
          if (x.ok) { if (dlg.close) dlg.close(); toast('ایمیل با فایل Excel برای ' + to + ' ارسال شد.'); }
          else toast(x.j.error || 'ارسال ناموفق بود.', true);
        }).catch(function () { goBtn.disabled = false; goBtn.textContent = 'ارسال به کارگزار'; toast('به سرور وصل نشد. اینترنت یا سرور را بررسی کنید.', true); });
      return;
    }
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: subject, text: 'به: ' + to + '\n\n' + body }).then(function () { toast('فایل به برنامه‌ی ایمیل داده شد. گیرنده: ' + to); })
        .catch(function (er) { if (er && er.name !== 'AbortError') fallbackMail(); });
    } else fallbackMail();
    function fallbackMail() {
      download(b.name, bytes, XLSX_T);
      location.href = 'mailto:' + encodeURIComponent(to).replace('%40', '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body + '\n\n(فایل ' + b.name + ' را پیوست کنید.)');
      toast('فایل دانلود شد. آن را به ایمیلی که باز شد پیوست کنید.');
    }
  });

  /* ---------- حالت شب و روز ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    lsSet('bp.theme', t);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t === 'dark' ? '#0F1720' : '#2A3440');
  }
  function toggleTheme() { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
  $('themeBtn').addEventListener('click', toggleTheme);
  $('themeBtn2').addEventListener('click', toggleTheme);
  setTheme(document.documentElement.getAttribute('data-theme') || 'light');

  var rt = $('rulesTbl').tBodies[0];
  function onRuleEdit(e) {
    var el = e.target, tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
    var r = rules[+tr.dataset.i], k = el.dataset.k;
    r[k] = k === 'enabled' ? el.checked : el.value;
    saveRules();
    if (e.type === 'change' && (k === 'type' || k === 'a' || k === 'b')) renderRules();
    rerun();
  }
  rt.addEventListener('input', onRuleEdit); rt.addEventListener('change', onRuleEdit);
  rt.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rm]'); if (!b) return;
    rules.splice(+b.dataset.rm, 1); saveRules(); renderRules(); rerun();
  });
  $('addRule').addEventListener('click', function () { addRule('', ''); });
  $('resetRules').addEventListener('click', function () {
    if (!rules.length || !confirm('همه قوانین شخصی پاک شوند؟ قوانین پچ تغییری نمی‌کنند.')) return;
    rules = []; saveRules(); renderRules(); rerun();
  });
  $('expRules').addEventListener('click', function () {
    download('barcode-pos-rules-' + stamp() + '.xlsx', C.buildXlsx([C.rulesSheet(rules)]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
  $('impRules').addEventListener('click', function () { $('rulesFile').click(); });
  $('rulesFile').addEventListener('change', async function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    try {
      var t = await C.openTable(await f.arrayBuffer(), f.name), imported = C.rulesFromRows(await t.getRows(0));
      if (!imported.length) throw new Error('قانونی در فایل پیدا نشد.');
      var replace = confirm('تعداد قانون‌های فایل: ' + imported.length + '\n\nتأیید: جایگزین قوانین فعلی شود\nانصراف: به قوانین فعلی اضافه شود');
      rules = replace ? imported : rules.concat(imported);
      saveRules(); renderRules(); rerun(); toast(imported.length + ' قانون وارد شد.');
    } catch (e) { toast(e.message || String(e), true); }
  });
  try { if (localStorage.getItem(MKEY) === '0') $('macroChk').checked = false; } catch (e) {}
  $('macroChk').addEventListener('change', function () { try { localStorage.setItem(MKEY, this.checked ? '1' : '0'); } catch (e) {} if (serials.length) run(); });

  /* ---------- PWA ---------- */
  function net() { var c = $('netChip'); c.textContent = navigator.onLine ? 'آنلاین' : 'آفلاین'; c.className = 'chip' + (navigator.onLine ? '' : ' off'); }
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', async function () {
    if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; this.hidden = true;
  });
  window.addEventListener('appinstalled', function () { $('installBtn').hidden = true; });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});

  renderMacroTable();
  renderRules();
  startSplash();
})();
