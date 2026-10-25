'use strict';

const API_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
];
const RETRY_DELAYS = [1, 2, 4, 8, 15, 30]; // segundos entre tentativas de reconexão
const STALL_TIMEOUT = 12000;               // sem áudio por esse tempo = reconectar
const LIVE_RESYNC_AFTER = 20000;           // pausa maior que isso: recarrega pra voltar ao "ao vivo"

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const player = $('player');

// ---------- Armazenamento local (pode falhar em aba privada) ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignora */ }
  },
};

let mine = store.get('mine', []);   // rádios adicionadas pela busca
let current = null;                 // rádio selecionada
let wantPlaying = false;            // o usuário quer ouvir (mesmo que o stream caia)
let retries = 0;
let retryTimer = null;
let stallTimer = null;
let pausedAt = 0;
let usingFallback = false;

// ---------- Lista ----------
function allStations() {
  return [...mine, ...PRESETS];
}

function initials(name) {
  return name.replace(/r[áa]dio|fm|am|\d+[.,]?\d*/gi, '').trim()
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '♪';
}

function colorFor(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 38%)`;
}

function fillLogo(el, st) {
  el.textContent = '';
  el.style.background = st.color || colorFor(st.name);
  el.textContent = st.short || initials(st.name);
  if (st.logo) {
    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { el.textContent = ''; el.appendChild(img); };
    img.src = st.logo;
  }
}

function tile(st, removable) {
  const b = document.createElement('button');
  b.className = 'tile';
  b.dataset.id = st.id;
  const logo = document.createElement('div');
  logo.className = 'logo';
  fillLogo(logo, st);
  const name = document.createElement('div');
  name.className = 't-name';
  name.textContent = st.name;
  const sub = document.createElement('div');
  sub.className = 't-sub';
  sub.textContent = st.sub || '';
  const eq = document.createElement('span');
  eq.className = 'eq';
  eq.innerHTML = '<i></i><i></i><i></i>';
  b.append(logo, name, sub, eq);
  if (removable) {
    const x = document.createElement('span');
    x.className = 'remove';
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', 'Remover ' + st.name);
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', (e) => { e.stopPropagation(); toggleMine(st); });
    b.appendChild(x);
  }
  b.addEventListener('click', () => {
    if ($('mineSection').classList.contains('editing')) return;
    if (current && current.id === st.id) togglePlay();
    else select(st, true);
  });
  return b;
}

function render() {
  const mineGrid = $('mineGrid');
  mineGrid.replaceChildren(...mine.map((s) => tile(s, true)));
  $('mineSection').hidden = mine.length === 0;
  if (mine.length === 0) setEditing(false);
  $('presetGrid').replaceChildren(...PRESETS.map((s) => tile(s, false)));
  markCurrent();
}

function markCurrent() {
  document.querySelectorAll('.tile').forEach((t) => {
    t.classList.toggle('current', !!current && t.dataset.id === current.id);
  });
}

function setEditing(on) {
  $('mineSection').classList.toggle('editing', on);
  $('editBtn').textContent = on ? 'Concluir' : 'Editar';
}

function toggleMine(st) {
  const i = mine.findIndex((s) => s.id === st.id);
  if (i >= 0) mine.splice(i, 1);
  else mine.unshift(st);
  store.set('mine', mine);
  render();
}

// ---------- Player ----------
function setState(state, text) {
  player.dataset.state = state;
  document.body.classList.toggle('is-playing', state === 'playing');
  $('npStatus').textContent = text || ' ';
  $('playBtn').setAttribute('aria-label', state === 'playing' ? 'Pausar' : 'Tocar');
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : (wantPlaying ? 'playing' : 'paused');
  }
}

function clearTimers() {
  clearTimeout(retryTimer); retryTimer = null;
  clearTimeout(stallTimer); stallTimer = null;
}

function select(st, autoplay) {
  current = st;
  usingFallback = false;
  retries = 0;
  store.set('last', st);
  $('npName').textContent = st.name;
  fillLogo($('npLogo'), st);
  markCurrent();
  updateMediaSession();
  if (autoplay) start();
  else setState('idle', st.sub || 'Toque para tocar');
}

function streamUrl() {
  return usingFallback && current.fallbackUrl ? current.fallbackUrl : current.url;
}

function start() {
  if (!current) return;
  clearTimers();
  wantPlaying = true;
  setState(retries ? 'reconnecting' : 'loading', retries ? `Reconectando… (tentativa ${retries})` : 'Conectando…');
  audio.src = streamUrl();
  audio.load();
  armStallTimer();
  const p = audio.play();
  if (p && p.catch) {
    p.catch((err) => {
      if (err && err.name === 'NotAllowedError') {
        // iOS: precisa de um toque antes de tocar.
        wantPlaying = false;
        clearTimers();
        setState('idle', 'Toque no play para ouvir');
      }
      // Outros erros chegam pelo evento "error".
    });
  }
}

function stop() {
  wantPlaying = false;
  clearTimers();
  pausedAt = Date.now();
  audio.pause();
  setState('paused', 'Pausado');
}

function resume() {
  if (!current) {
    const first = allStations()[0];
    if (first) select(first, true);
    return;
  }
  // Rádio ao vivo: se ficou muito tempo pausado, recarrega para não tocar áudio atrasado.
  if (audio.src && audio.paused && Date.now() - pausedAt < LIVE_RESYNC_AFTER && audio.readyState >= 2) {
    wantPlaying = true;
    setState('loading', 'Conectando…');
    armStallTimer();
    audio.play().catch(() => start());
  } else {
    retries = 0;
    start();
  }
}

function togglePlay() {
  if (wantPlaying) stop(); else resume();
}

function step(dir) {
  const list = allStations();
  if (!list.length) return;
  let i = current ? list.findIndex((s) => s.id === current.id) : -1;
  i = (i + dir + list.length) % list.length;
  select(list[i], true);
}

function armStallTimer() {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => { if (wantPlaying) scheduleRetry(); }, STALL_TIMEOUT);
}

async function scheduleRetry() {
  if (!wantPlaying || retryTimer) return;
  clearTimeout(stallTimer);
  retries++;
  // Depois de duas falhas, tenta o link atualizado da Radio Browser (se houver).
  if (retries === 3 && current.uuid && !usingFallback) {
    const alt = await fetchFallback(current);
    if (alt) { current.fallbackUrl = alt; usingFallback = true; }
  }
  const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
  setState('reconnecting', navigator.onLine === false ? 'Sem internet — tentando de novo…' : `Reconectando em ${delay}s…`);
  retryTimer = setTimeout(() => { retryTimer = null; if (wantPlaying) start(); }, delay * 1000);
}

audio.addEventListener('playing', () => {
  clearTimers();
  retries = 0;
  setState('playing', 'Ao vivo');
});
audio.addEventListener('waiting', () => {
  if (!wantPlaying) return;
  if (retries) setState('reconnecting', `Reconectando… (tentativa ${retries})`);
  else setState('loading', 'Carregando…');
  armStallTimer();
});
audio.addEventListener('stalled', () => { if (wantPlaying) armStallTimer(); });
audio.addEventListener('error', () => { if (wantPlaying) scheduleRetry(); });
audio.addEventListener('ended', () => { if (wantPlaying) scheduleRetry(); });
audio.addEventListener('pause', () => {
  // Pausa vinda do sistema (ligação, Siri, outro app) que não passou pelos nossos botões.
  if (wantPlaying && !retryTimer && audio.error == null && player.dataset.state === 'playing') {
    wantPlaying = false;
    clearTimers();
    pausedAt = Date.now();
    setState('paused', 'Pausado');
  }
});
window.addEventListener('online', () => {
  if (wantPlaying && player.dataset.state !== 'playing') { clearTimers(); start(); }
});

// ---------- Tela de bloqueio / botões do carro ----------
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !current) return;
  const art = current.logo && current.logo.startsWith('https:')
    ? [{ src: current.logo, sizes: '512x512' }]
    : [];
  art.push({ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' });
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.name,
    artist: current.sub || 'Ao vivo',
    album: 'Rádio BR',
    artwork: art,
  });
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* não suportado */ } };
  set('play', resume);
  set('pause', stop);
  set('stop', stop);
  set('nexttrack', () => step(1));
  set('previoustrack', () => step(-1));
  set('seekforward', null);
  set('seekbackward', null);
  set('seekto', null);
}

// ---------- Radio Browser ----------
async function api(path) {
  let lastErr;
  for (const host of API_HOSTS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(host + path, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { lastErr = e; }
    finally { clearTimeout(t); }
  }
  throw lastErr;
}

async function fetchFallback(st) {
  try {
    const [r] = await api('/json/stations/byuuid/' + encodeURIComponent(st.uuid));
    const url = r && (r.url_resolved || r.url);
    if (url && url.startsWith('https:') && url !== st.url) return url;
  } catch { /* sem plano B */ }
  return null;
}

function fromApi(r) {
  const url = r.url_resolved || r.url || '';
  const place = [r.state, r.codec && r.bitrate ? `${r.codec} ${r.bitrate}k` : r.codec].filter(Boolean).join(' · ');
  return {
    id: r.stationuuid,
    uuid: r.stationuuid,
    name: r.name.trim(),
    sub: place,
    url,
    logo: r.favicon && r.favicon.startsWith('https:') ? r.favicon : '',
  };
}

let searchSeq = 0;
async function search(q) {
  const seq = ++searchSeq;
  const status = $('searchStatus');
  const list = $('results');
  q = q.trim();
  if (q.length < 2) {
    status.textContent = 'Digite pelo menos 2 letras.';
    list.replaceChildren();
    return;
  }
  status.textContent = 'Buscando…';
  try {
    const params = new URLSearchParams({
      countrycode: 'BR', name: q, hidebroken: 'true',
      order: 'clickcount', reverse: 'true', limit: '60',
    });
    let rows = await api('/json/stations/search?' + params);
    if (rows.length < 5) {
      // Também procura por cidade/estado.
      const byState = await api('/json/stations/search?' + new URLSearchParams({
        countrycode: 'BR', state: q, hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '40',
      }));
      rows = rows.concat(byState);
    }
    if (seq !== searchSeq) return;
    const seen = new Set();
    const stations = rows.map(fromApi).filter((s) => {
      // Só HTTPS: o iPhone bloqueia stream HTTP dentro de site HTTPS.
      if (!s.url.startsWith('https:') || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    status.textContent = stations.length ? `${stations.length} rádios` : 'Nenhuma rádio encontrada.';
    list.replaceChildren(...stations.map(resultRow));
  } catch {
    if (seq !== searchSeq) return;
    status.textContent = 'Não consegui buscar agora. Verifique a internet.';
  }
}

function resultRow(st) {
  const li = document.createElement('li');
  const main = document.createElement('button');
  main.className = 'r-main';
  const logo = document.createElement('div');
  logo.className = 'logo small';
  fillLogo(logo, st);
  const text = document.createElement('div');
  text.className = 'r-text';
  text.innerHTML = '<div class="r-name"></div><div class="r-sub"></div>';
  text.firstChild.textContent = st.name;
  text.lastChild.textContent = st.sub;
  main.append(logo, text);
  main.addEventListener('click', () => select(st, true));

  const fav = document.createElement('button');
  fav.className = 'fav';
  fav.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
  const sync = () => {
    const on = mine.some((s) => s.id === st.id);
    fav.classList.toggle('on', on);
    fav.setAttribute('aria-label', on ? 'Remover das minhas rádios' : 'Adicionar às minhas rádios');
  };
  sync();
  fav.addEventListener('click', () => { toggleMine(st); sync(); });
  li.append(main, fav);
  return li;
}

// ---------- Eventos da interface ----------
$('playBtn').addEventListener('click', togglePlay);
$('nextBtn').addEventListener('click', () => step(1));
$('prevBtn').addEventListener('click', () => step(-1));
$('editBtn').addEventListener('click', () => setEditing(!$('mineSection').classList.contains('editing')));

let searchDebounce;
$('searchBtn').addEventListener('click', () => {
  $('search').hidden = false;
  $('searchInput').focus();
});
$('closeSearch').addEventListener('click', () => {
  $('search').hidden = true;
  $('searchInput').blur();
});
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => search(e.target.value), 450);
});
$('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(searchDebounce); search(e.target.value); e.target.blur(); }
});

// ---------- Início ----------
render();
const last = store.get('last', null);
const lastStation = last && (allStations().find((s) => s.id === last.id) || last);
if (lastStation && lastStation.url) select(lastStation, false);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
