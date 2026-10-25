'use strict';

const API_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
];
const RETRY_DELAYS = [1, 2, 4, 8, 15, 30]; // segundos entre tentativas de reconexão
const STALL_TIMEOUT = 12000;               // sem áudio por esse tempo = reconectar
const LIVE_RESYNC_AFTER = 20000;           // pausa maior que isso: recarrega pra voltar ao "ao vivo"
const MAX_RECENT = 5;

document.documentElement.classList.add('js');
const $ = (id) => document.getElementById(id);
const audio = $('audio');
const player = $('player');
const car = $('carMode');
const np = $('nowPlaying');

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

// Favoritas e recentes: rádio fixa guarda só o id (o link vem sempre do stations.js);
// rádio vinda da busca guarda o objeto inteiro.
let favs = store.get('mine', []);
let recent = store.get('recent', []);
let current = null;                 // rádio selecionada
let wantPlaying = false;            // o usuário quer ouvir (mesmo que o stream caia)
let retries = 0;
let retryTimer = null;
let stallTimer = null;
let pausedAt = 0;
let usingFallback = false;
let editing = false;
let sleepAt = 0;                    // horário (ms) em que o timer desliga; 0 = sem timer

// ---------- Lista ----------
const presetById = (id) => PRESETS.find((s) => s.id === id);
const ref = (st) => (presetById(st.id) ? { id: st.id } : st);
const resolve = (r) => presetById(r.id) || (r.url ? r : null);

function favStations() { return favs.map(resolve).filter(Boolean); }
function recentStations() { return recent.map(resolve).filter(Boolean); }
function isFav(st) { return !!st && favs.some((f) => f.id === st.id); }

function allStations() {
  const seen = new Set();
  return [...favStations(), ...PRESETS].filter((s) => !seen.has(s.id) && seen.add(s.id));
}

function toggleFav(st) {
  if (!st) return;
  const i = favs.findIndex((f) => f.id === st.id);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(ref(st));
  store.set('mine', favs);
  render();
}

function moveFav(id, dir) {
  const i = favs.findIndex((f) => f.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= favs.length) return;
  [favs[i], favs[j]] = [favs[j], favs[i]];
  store.set('mine', favs);
  render();
}

function addRecent(st) {
  recent = [ref(st), ...recent.filter((r) => r.id !== st.id)].slice(0, MAX_RECENT);
  store.set('recent', recent);
  renderRecent();
  renderCar();
  markCurrent();
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

const stationColor = (st) => st.color || colorFor(st.name);

// Arte da rádio: a sigla na cor da rádio aparece na hora; o logo, quando carrega, cobre por cima.
function fillLogo(box, st) {
  box.style.setProperty('--art', stationColor(st));
  const label = st.short || initials(st.name);
  const mono = el('span', label.length > 4 ? 'mono long' : 'mono', label);
  box.replaceChildren(mono);
  if (st.logo) {
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { if (!mono.isConnected) return; mono.remove(); box.prepend(img); };
    img.src = st.logo;
  }
}

const icon = (name, kind = 'fill') =>
  `<svg class="${kind}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function logoEl(st, cls) {
  const l = el('div', cls || 'logo');
  fillLogo(l, st);
  return l;
}

const STAR = icon('star');

function pick(st) {
  if (current && current.id === st.id) togglePlay();
  else select(st, true);
}

function tile(st) {
  const b = el('button', 'tile');
  b.dataset.id = st.id;
  b.setAttribute('aria-label', [st.name, st.sub, st.kind].filter(Boolean).join(', '));
  const art = logoEl(st);
  const eq = el('span', 'eq');
  eq.innerHTML = '<i></i><i></i><i></i>';
  art.appendChild(eq);
  if (isFav(st)) {
    const star = el('span', 'fav-badge');
    star.innerHTML = STAR;
    art.appendChild(star);
  }
  b.append(art, el('div', 't-name', st.name), el('div', 't-sub', st.sub || ''));
  if (st.kind) b.appendChild(el('div', 't-kind', st.kind));
  b.addEventListener('click', () => pick(st));
  return b;
}

function editRow(st, index, total) {
  const li = el('li');
  const btn = (label, svg, fn, disabled) => {
    const b = el('button', 'row-btn');
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    b.disabled = disabled;
    b.addEventListener('click', fn);
    return b;
  };
  const text = el('div', 'r-text');
  text.append(el('div', 'r-name', st.name), el('div', 'r-sub', st.sub || ''));
  li.append(
    btn('Remover ' + st.name, icon('minus', 'line'), () => toggleFav(st), false),
    logoEl(st),
    text,
    btn('Subir ' + st.name, icon('up', 'line'), () => moveFav(st.id, -1), index === 0),
    btn('Descer ' + st.name, icon('dn', 'line'), () => moveFav(st.id, 1), index === total - 1),
  );
  li.firstChild.classList.add('danger');
  return li;
}

function renderRecent() {
  const list = recentStations();
  $('recentSection').hidden = list.length === 0;
  $('recentStrip').replaceChildren(...list.map((st) => {
    const c = el('button', 'chip');
    c.dataset.id = st.id;
    c.append(logoEl(st), el('span', null, st.name));
    c.addEventListener('click', () => pick(st));
    return c;
  }));
}

function render() {
  const fl = favStations();
  if (fl.length === 0) editing = false;
  $('mineSection').hidden = fl.length === 0;
  $('mineSection').classList.toggle('editing', editing);
  $('editBtn').textContent = editing ? 'Concluir' : 'Editar';
  $('mineGrid').hidden = editing;
  $('mineList').hidden = !editing;
  $('mineGrid').replaceChildren(...fl.map((s) => tile(s)));
  $('mineList').replaceChildren(...fl.map((s, i) => editRow(s, i, fl.length)));

  // Se um stations.js antigo vier do cache (sem REGIONS), mostra tudo numa seção só.
  const regions = typeof REGIONS !== 'undefined' ? REGIONS : [{ id: undefined, title: 'Rádios' }];
  $('regions').replaceChildren(...regions.map((r) => {
    const section = el('section');
    const head = el('div', 'section-head');
    head.appendChild(el('h2', null, r.title));
    const grid = el('div', 'grid');
    grid.replaceChildren(...PRESETS.filter((s) => s.region === r.id).map((s) => tile(s)));
    section.append(head, grid);
    return section;
  }));

  renderRecent();
  renderCar();
  updateFavBtn();
  markCurrent();
}

function markCurrent() {
  document.querySelectorAll('.tile, .chip, .car-tile').forEach((t) => {
    t.classList.toggle('current', !!current && t.dataset.id === current.id);
  });
}

function updateFavBtn() {
  const on = isFav(current);
  for (const b of [$('favBtn'), $('npFav')]) {
    b.disabled = !current;
    b.classList.toggle('on', on);
    b.setAttribute('aria-label', on ? 'Tirar das favoritas' : 'Adicionar às favoritas');
  }
}

function favCurrent(btn) {
  toggleFav(current);
  btn.classList.remove('pop');
  void btn.offsetWidth; // reinicia a animação
  btn.classList.toggle('pop', isFav(current));
}

// ---------- Player ----------
function setState(state, text) {
  player.dataset.state = state;
  car.dataset.state = state;
  np.dataset.state = state;
  document.body.classList.toggle('is-playing', state === 'playing');
  $('npLiveText').textContent = state === 'playing' ? 'Ao vivo' : (text || 'Pausado');
  $('npStatus').textContent = text || ' ';
  $('carStatus').textContent = text || ' ';
  const label = state === 'playing' ? 'Pausar' : 'Tocar';
  $('playBtn').setAttribute('aria-label', label);
  $('carPlay').setAttribute('aria-label', label);
  $('npPlay').setAttribute('aria-label', label);
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
  $('carName').textContent = st.name;
  $('npTitle').textContent = st.name;
  $('npSub').textContent = [st.sub, st.kind].filter(Boolean).join(', ');
  document.documentElement.style.setProperty('--station', stationColor(st));
  fillLogo($('npLogo'), st);
  fillLogo($('npArt'), st);
  markCurrent();
  updateFavBtn();
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

function stop(text) {
  wantPlaying = false;
  clearTimers();
  pausedAt = Date.now();
  audio.pause();
  setState('paused', text || 'Pausado');
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
  // Tocando uma favorita: ⏮ ⏭ andam só entre as favoritas.
  const fl = favStations();
  const list = isFav(current) && fl.length >= 2 ? fl : allStations();
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
  if (current) addRecent(current);
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
audio.addEventListener('timeupdate', checkSleep);
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

// ---------- Timer para desligar ----------
function setSleep(minutes) {
  sleepAt = minutes ? Date.now() + minutes * 60000 : 0;
  updateSleep();
}

function checkSleep() {
  if (sleepAt && Date.now() >= sleepAt) {
    sleepAt = 0;
    if (wantPlaying) stop('Timer: desligado');
  }
  updateSleep();
}

function updateSleep() {
  const left = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : 0;
  $('sleepLeft').hidden = !left;
  $('sleepLeft').textContent = left;
  $('sleepBtn').classList.toggle('active', !!left);
  $('carSleep').textContent = left ? `Desliga em ${left} min` : '';
  $('npSleep').classList.toggle('active', !!left);
  $('npSleepText').textContent = left ? `${left} min` : 'Timer';
}

setInterval(checkSleep, 15000);

// ---------- Modo carro ----------
function renderCar() {
  const fl = favStations();
  const list = fl.length ? fl : recentStations();
  $('carHint').hidden = fl.length > 0;
  $('carGrid').replaceChildren(...list.map((st) => {
    const b = el('button', 'car-tile');
    b.dataset.id = st.id;
    b.append(logoEl(st), el('span', 'car-tile-name', st.name));
    b.addEventListener('click', () => pick(st));
    return b;
  }));
}

function setCarMode(on) {
  car.hidden = !on;
  document.body.classList.toggle('car-on', on);
  store.set('carMode', on);
}

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
  set('pause', () => stop());
  set('stop', () => stop());
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
  const place = (r.state || '').trim() || 'Brasil';
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
  const li = el('li');
  const main = el('button', 'r-main');
  const text = el('div', 'r-text');
  text.append(el('div', 'r-name', st.name), el('div', 'r-sub', st.sub));
  main.append(logoEl(st, 'logo small'), text);
  main.addEventListener('click', () => select(st, true));

  const fav = el('button', 'fav');
  fav.innerHTML = STAR;
  const sync = () => {
    const on = isFav(st);
    fav.classList.toggle('on', on);
    fav.setAttribute('aria-label', on ? 'Tirar das favoritas' : 'Adicionar às favoritas');
  };
  sync();
  fav.addEventListener('click', () => { toggleFav(st); sync(); });
  li.append(main, fav);
  return li;
}

// ---------- Eventos da interface ----------
$('playBtn').addEventListener('click', togglePlay);
$('nextBtn').addEventListener('click', () => step(1));
$('prevBtn').addEventListener('click', () => step(-1));
$('favBtn').addEventListener('click', () => favCurrent($('favBtn')));
$('npFav').addEventListener('click', () => favCurrent($('npFav')));

// ---------- Tocando agora: abre de baixo, fecha arrastando ----------
let lastFocus = null;
function openNowPlaying() {
  if (!current) return;
  lastFocus = document.activeElement;
  np.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => np.classList.add('open')));
  $('npSheet').focus({ preventScroll: true });
}
function closeNowPlaying() {
  if (np.hidden) return;
  np.classList.remove('open');
  $('npSheet').style.transform = '';
  const done = () => { if (!np.classList.contains('open')) np.hidden = true; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) done(); else setTimeout(done, 450);
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
$('npOpen').addEventListener('click', openNowPlaying);
$('npClose').addEventListener('click', closeNowPlaying);
$('npPlay').addEventListener('click', togglePlay);
$('npNext').addEventListener('click', () => step(1));
$('npPrev').addEventListener('click', () => step(-1));
$('npSleep').addEventListener('click', () => { $('sleepMenu').hidden = false; });
$('npCar').addEventListener('click', () => { closeNowPlaying(); setCarMode(true); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('sleepMenu').hidden) $('sleepMenu').hidden = true;
  else closeNowPlaying();
});
(() => {
  const sheet = $('npSheet');
  let y0 = null, dy = 0, t0 = 0;
  sheet.addEventListener('pointerdown', (e) => {
    if (sheet.scrollTop > 0 || e.target.closest('button')) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
    np.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    np.classList.remove('dragging');
    const fast = dy / (performance.now() - t0) > 0.6;
    if (dy > 140 || (fast && dy > 40)) closeNowPlaying();
    else sheet.style.transform = '';
    y0 = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
})();

// ---------- Título grande que vira barra ao rolar ----------
new IntersectionObserver(([e]) => $('top').classList.toggle('scrolled', !e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' })
  .observe($('bigTitle'));
$('editBtn').addEventListener('click', () => { editing = !editing; render(); });

$('carBtn').addEventListener('click', () => setCarMode(true));
$('carExit').addEventListener('click', () => setCarMode(false));
$('carPlay').addEventListener('click', togglePlay);
$('carNext').addEventListener('click', () => step(1));
$('carPrev').addEventListener('click', () => step(-1));

$('sleepBtn').addEventListener('click', () => { $('sleepMenu').hidden = false; });
$('sleepClose').addEventListener('click', () => { $('sleepMenu').hidden = true; });
$('sleepCancel').addEventListener('click', () => { setSleep(0); $('sleepMenu').hidden = true; });
$('sleepMenu').addEventListener('click', (e) => {
  const min = e.target.closest('[data-min]');
  if (min) { setSleep(Number(min.dataset.min)); $('sleepMenu').hidden = true; }
  else if (e.target === $('sleepMenu')) $('sleepMenu').hidden = true;
});

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
if (store.get('carMode', false)) setCarMode(true);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // O app do iPhone fica aberto em segundo plano; ao voltar, procura versão nova.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  // Quando uma versão nova assume, recarrega a tela (só se nada estiver tocando).
  let reloaded = !navigator.serviceWorker.controller; // primeira visita: não precisa recarregar
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || wantPlaying) return;
    reloaded = true;
    location.reload();
  });
}
