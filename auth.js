/* auth.js — قفل ورود. رمز در کد ذخیره نشده؛ فقط هش SHA-256 (با salt) نگه‌داری می‌شود.
   توجه: این قفل سمت مرورگر است و مانع دیدن/کپی شدن خودِ فایل‌های برنامه نمی‌شود. */
(function (root) {
  'use strict';
  var SALT = 'bp1|';
  var HASH = 'bab441eea98ce44a9084c259ae8ec050ee01f626813aa3bce212b18739c1edcf';

  function sha256js(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mp = Math.pow, mw = mp(2, 32), i, j, result = '', words = [], bits = ascii.length * 8;
    var hash = [], k = [], pc = 0, comp = {}, c;
    for (c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (mp(c, 0.5) * mw) | 0;
        k[pc++] = (mp(c, 1 / 3) * mw) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bits / mw) | 0;
    words[words.length] = bits;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? '0' : '') + b.toString(16); }
    return result;
  }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sha256hex(str) {
    var utf8 = unescape(encodeURIComponent(str));
    if (root.crypto && root.crypto.subtle) {
      return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(hex).catch(function () { return sha256js(utf8); });
    }
    return Promise.resolve(sha256js(utf8));
  }
  function verify(pw) { return sha256hex(SALT + pw).then(function (h) { return h === HASH; }); }

  var api = { verify: verify, sha256hex: sha256hex, sha256js: sha256js, HASH: HASH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BPAuth = api;
})(typeof self !== 'undefined' ? self : this);
