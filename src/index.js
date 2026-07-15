// SinoTrack signed API client + test route
// MD5 implementation (Cloudflare Workers' Web Crypto API does not support MD5 natively)
function md5(str) {
  function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
  function toHex(num) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((num >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  }
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const S = [
    7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
    5, 9,14,20, 5, 9,14,20, 5, 9,14,20, 5, 9,14,20,
    4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
    6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21
  ];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  const origLenBits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 4; i++) bytes.push((origLenBits >>> (i * 8)) & 0xff);
  for (let i = 0; i < 4; i++) bytes.push(0);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) {
      const off = chunkStart + j * 4;
      M[j] = bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

const SINOTRACK_APPID = 'MjQ2LnNpbm90cmFjay5jb20v';
const SINOTRACK_URL = 'https://246.sinotrack.com/APP/AppJson.asp';

function buildToken(cmd, deviceId, suffix) {
  const raw = cmd + '\x11' + "N'" + deviceId + "'" + '\x11\x11' + '\x1b' + suffix;
  const bytes = [];
  for (let i = 0; i < raw.length; i++) bytes.push(raw.charCodeAt(i));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function getLastPosition(deviceId) {
  const nTimeStamp = String(Date.now());
  const strRandom = String(Math.floor(Math.random() * 1e14));
  const strToken = buildToken('Proc_GetLastPosition', deviceId, '40');
  const concat = nTimeStamp + strRandom + deviceId + SINOTRACK_APPID + strToken;
  const strSign = md5(concat);

  const body = new URLSearchParams({
    strAppID: SINOTRACK_APPID,
    strUser: deviceId,
    nTimeStamp,
    strRandom,
    strSign,
    strToken
  });

  const resp = await fetch(SINOTRACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await resp.json();
  if (!data.m_isResultOk || !data.m_arrRecord || !data.m_arrRecord[0]) {
    return { error: true, raw: data };
  }

  const fields = data.m_arrField;
  const record = data.m_arrRecord[0];
  const result = {};
  fields.forEach((f, i) => { result[f] = record[i]; });
  return result;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/test-position') {
      const deviceId = url.searchParams.get('device') || '9171061904';
      const position = await getLastPosition(deviceId);
      return new Response(JSON.stringify(position, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('SinoTrack SMS worker is running.');
  }
};
