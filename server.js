#!/usr/bin/env node
/* Barcode POS: سرور کوچک بدون وابستگی (فقط Node 18+)
   ۱) فایل‌های برنامه را سرو می‌کند.  ۲) POST /api/send: ایمیل با پیوست Excel را از طریق SMTP می‌فرستد.
   تنظیمات با متغیرهای محیطی (فایل .env هم خوانده می‌شود، نمونه: env.example):
     SMTP_HOST, SMTP_PORT (465 یا 587), SMTP_SECURE (ssl | starttls | plain), SMTP_USER, SMTP_PASS, MAIL_FROM
     SEND_KEY            کلید ارسال؛ بدون آن ارسال خودکار خاموش است
     ALLOWED_RECIPIENTS  فهرست ایمیل‌های مجاز با کاما (اختیاری ولی توصیه می‌شود)
     PORT                پیش‌فرض 8080 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), net = require('net'), tls = require('tls'), crypto = require('crypto');

(function loadEnv() {
  try {
    fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(function (l) {
      var m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l);
      if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* بدون .env */ }
})();

var E = process.env;
var CFG = {
  host: E.SMTP_HOST, port: +(E.SMTP_PORT || 465), secure: (E.SMTP_SECURE || (E.SMTP_PORT === '587' ? 'starttls' : 'ssl')).toLowerCase(),
  user: E.SMTP_USER, pass: E.SMTP_PASS, from: E.MAIL_FROM || E.SMTP_USER, key: E.SEND_KEY || '',
  allowed: (E.ALLOWED_RECIPIENTS || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean),
  port_http: +(E.PORT || 8080)
};
function sendEnabled() { return !!(CFG.host && CFG.from && CFG.key); }

/* ---------- SMTP حداقلی ---------- */
function smtpSend(cfg, mail) {
  return new Promise(function (resolve, reject) {
    var sock, buf = '', waiters = [], done = false, upgraded = false;
    function fail(e) { if (done) return; done = true; try { sock && sock.destroy(); } catch (x) {} reject(e instanceof Error ? e : new Error(String(e))); }
    function onData(d) {
      buf += d.toString('utf8');
      for (;;) {
        var m = /^(?:\d{3}-.*\r?\n)*\d{3} .*\r?\n/.exec(buf); if (!m) break;
        var reply = m[0]; buf = buf.slice(reply.length);
        var w = waiters.shift(); if (w) w(reply);
      }
    }
    function bind(s) { sock = s; s.setTimeout(30000, function () { fail(new Error('SMTP timeout')); }); s.on('data', onData); s.on('error', fail); s.on('close', function () { if (!done) fail(new Error('SMTP closed')); }); }
    function read() { return new Promise(function (r) { waiters.push(r); }); }
    async function expect(codes) { var r = await read(); var c = +r.slice(0, 3); if (codes.indexOf(c) < 0) throw new Error('SMTP ' + r.trim()); return r; }
    async function cmd(line, codes) { sock.write(line + '\r\n'); return expect(codes); }
    async function run() {
      await expect([220]);
      var ehlo = await cmd('EHLO barcodepos.local', [250]);
      if (cfg.secure === 'starttls') {
        await cmd('STARTTLS', [220]);
        sock.removeAllListeners('data'); sock.removeAllListeners('close'); sock.removeAllListeners('error');
        var t = tls.connect({ socket: sock, servername: cfg.host }); await new Promise(function (ok, no) { t.once('secureConnect', ok); t.once('error', no); });
        buf = ''; bind(t); upgraded = true;
        await cmd('EHLO barcodepos.local', [250]);
      }
      if (cfg.user) {
        await cmd('AUTH LOGIN', [334]);
        await cmd(Buffer.from(cfg.user).toString('base64'), [334]);
        await cmd(Buffer.from(cfg.pass || '').toString('base64'), [235]);
      }
      await cmd('MAIL FROM:<' + addrOnly(cfg.from) + '>', [250]);
      await cmd('RCPT TO:<' + mail.to + '>', [250, 251]);
      await cmd('DATA', [354]);
      sock.write(buildMime(cfg, mail) + '\r\n.\r\n');
      await expect([250]);
      try { sock.write('QUIT\r\n'); } catch (e) {}
      done = true; sock.end(); resolve();
    }
    var onConnect = function () { run().catch(fail); };
    if (cfg.secure === 'ssl') { bind(tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, onConnect)); }
    else { bind(net.connect({ host: cfg.host, port: cfg.port }, onConnect)); }
  });
}
function addrOnly(s) { var m = /<([^>]+)>/.exec(s); return (m ? m[1] : s).trim(); }
function b64lines(buf) { return buf.toString('base64').replace(/(.{76})/g, '$1\r\n'); }
function encHeader(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?='; }
function buildMime(cfg, m) {
  var bd = '=_bp_' + crypto.randomBytes(12).toString('hex'), fname = m.filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return [
    'From: ' + cfg.from, 'To: ' + m.to, 'Subject: ' + encHeader(m.subject), 'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@barcodepos>', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' + bd + '"', '',
    '--' + bd, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(Buffer.from(m.body, 'utf8')),
    '--' + bd, 'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="' + fname + '"',
    'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="' + fname + '"', '', b64lines(m.file),
    '--' + bd + '--', ''
  ].join('\r\n');
}

/* ---------- HTTP ---------- */
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
var PUBLIC = { 'index.html': 1, 'style.css': 1, 'macro-data.js': 1, 'core.js': 1, 'auth.js': 1, 'app.js': 1, 'sw.js': 1, 'manifest.webmanifest': 1,
  'icon-192.png': 1, 'icon-512.png': 1, 'icon-512-maskable.png': 1, 'assets/Yekan.ttf': 1, 'assets/logo.png': 1, 'assets/splash.webp': 1 };
var hits = {};
function limited(ip) { var n = Date.now(), a = (hits[ip] = (hits[ip] || []).filter(function (t) { return n - t < 600000; })); if (a.length >= 20) return true; a.push(n); return false; }
function json(res, code, o) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); }
function safeEq(a, b) { var x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

var server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
  if (p === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, mail: sendEnabled(), restricted: CFG.allowed.length > 0 });
  if (p === '/api/send' && req.method === 'POST') {
    if (!sendEnabled()) return json(res, 503, { error: 'ارسال خودکار روی سرور تنظیم نشده است.' });
    var ip = req.socket.remoteAddress || '?';
    if (limited(ip)) return json(res, 429, { error: 'تعداد ارسال‌ها زیاد است. چند دقیقه بعد دوباره امتحان کنید.' });
    if (!safeEq(req.headers['x-send-key'] || '', CFG.key)) return json(res, 401, { error: 'کلید ارسال درست نیست.' });
    var chunks = [], size = 0;
    req.on('data', function (c) { size += c.length; if (size > 12e6) { req.destroy(); } else chunks.push(c); });
    req.on('end', function () {
      var j; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return json(res, 400, { error: 'درخواست نامعتبر است.' }); }
      var to = String(j.to || '').trim().toLowerCase();
      if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return json(res, 400, { error: 'ایمیل گیرنده درست نیست.' });
      if (CFG.allowed.length && CFG.allowed.indexOf(to) < 0) return json(res, 403, { error: 'این ایمیل در فهرست گیرنده‌های مجاز سرور نیست.' });
      var file = Buffer.from(String(j.data || ''), 'base64');
      if (!file.length || file[0] !== 0x50 || file[1] !== 0x4b) return json(res, 400, { error: 'فایل Excel معتبر نیست.' });
      smtpSend(CFG, { to: to, subject: String(j.subject || 'خروجی سریال کارتخوان').slice(0, 200).replace(/[\r\n]/g, ' '), body: String(j.body || '').slice(0, 5000),
        filename: String(j.filename || 'barcode-pos.xlsx'), file: file })
        .then(function () { json(res, 200, { ok: true }); })
        .catch(function (e) { console.error('SMTP error:', e.message); json(res, 502, { error: 'ارسال ایمیل ناموفق بود: ' + e.message.slice(0, 160) }); });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  var rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
  if (!PUBLIC[rel]) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, rel), function (err, data) {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': rel === 'sw.js' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
if (require.main === module) server.listen(CFG.port_http, function () {
  console.log('Barcode POS: http://localhost:' + CFG.port_http + '  |  ارسال خودکار ایمیل: ' + (sendEnabled() ? 'روشن' : 'خاموش (SMTP_HOST و SEND_KEY را تنظیم کنید)'));
});
module.exports = { server: server, smtpSend: smtpSend };
