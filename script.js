'use strict';

/* ==========================================================
   Nimbus - script.js
   Sections:
   1. Config + helpers
   2. Weather code table (what each number from the API means)
   3. Animated background (canvas)
   4. Talking to the APIs
   5. Rendering the UI
   6. "Smart" features (advice + best time outside)
   7. Search, location, units, recent searches
   8. Start-up
   ========================================================== */

/* ---------- 1. CONFIG + HELPERS ---------- */
const GEO_URL     = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const DEFAULT_PLACE = { name: 'Toronto', admin1: 'Ontario', country: 'Canada', latitude: 43.70643, longitude: -79.39864 };

const $ = (id) => document.getElementById(id);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const rand = (a, b) => a + Math.random() * (b - a);

// localStorage can throw (private mode), so wrap it.
function load(key, fallback) {
  try {
    const raw = localStorage.getItem('nimbus.' + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem('nimbus.' + key, JSON.stringify(value)); } catch { /* ignore */ }
}

const state = {
  place: null,
  data: null,
  unit: load('unit', 'metric'),   // 'metric' or 'imperial'
  suggestions: [],
  activeIdx: -1,
  requestId: 0,                   // guards against slow responses arriving out of order
};

/* ---------- 2. WEATHER CODES (WMO standard used by Open-Meteo) ---------- */
const CODES = {};
const add = (codes, info) => codes.forEach((c) => { CODES[c] = info; });

add([0],            { label: 'Clear sky',              day: '☀️',  night: '🌙', theme: 'clear'  });
add([1],            { label: 'Mainly clear',           day: '🌤️', night: '🌙', theme: 'clear'  });
add([2],            { label: 'Partly cloudy',          day: '⛅',  night: '☁️', theme: 'cloudy' });
add([3],            { label: 'Overcast',               day: '☁️', night: '☁️', theme: 'cloudy' });
add([45, 48],       { label: 'Fog',                    day: '🌫️', night: '🌫️', theme: 'fog'    });
add([51, 53, 55],   { label: 'Drizzle',                day: '🌦️', night: '🌧️', theme: 'rain'   });
add([56, 57],       { label: 'Freezing drizzle',       day: '🌧️', night: '🌧️', theme: 'rain'   });
add([61, 63, 65],   { label: 'Rain',                   day: '🌧️', night: '🌧️', theme: 'rain'   });
add([66, 67],       { label: 'Freezing rain',          day: '🌧️', night: '🌧️', theme: 'rain'   });
add([71, 73, 75, 77], { label: 'Snow',                 day: '🌨️', night: '🌨️', theme: 'snow'   });
add([80, 81, 82],   { label: 'Rain showers',           day: '🌦️', night: '🌧️', theme: 'rain'   });
add([85, 86],       { label: 'Snow showers',           day: '🌨️', night: '🌨️', theme: 'snow'   });
add([95],           { label: 'Thunderstorm',           day: '⛈️', night: '⛈️', theme: 'storm'  });
add([96, 99],       { label: 'Thunderstorm with hail', day: '⛈️', night: '⛈️', theme: 'storm'  });

const info = (code) => CODES[code] || { label: 'Unknown', day: '🌡️', night: '🌡️', theme: 'cloudy' };
const iconFor = (code, isDay) => (isDay ? info(code).day : info(code).night);
const isWet = (code) => ['rain', 'snow', 'storm'].includes(info(code).theme);

/* ---------- 3. ANIMATED BACKGROUND ---------- */
const FX = (() => {
  const canvas = $('fx');
  const ctx = canvas.getContext('2d');
  const flash = $('flash');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, mode = 'none', parts = [], raf = 0, flashTimer = 0;

  // Each mode says how many particles, how to create one, and how to draw+move one.
  const rain = {
    count: (a) => a * 14,
    make: () => ({ x: rand(0, w), y: rand(0, h), len: rand(10, 22), v: rand(11, 18) }),
    draw(p) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.len * 0.18, p.y + p.len);
      ctx.stroke();
      p.y += p.v;
      p.x -= p.v * 0.18;
      if (p.y > h) { p.y = -p.len; p.x = rand(0, w + 120); }
      if (p.x < 0) p.x = w;
    },
  };

  const modes = {
    none: { count: () => 0, make: () => ({}), draw() {} },
    rain,
    storm: { ...rain, count: (a) => a * 24 },
    snow: {
      count: (a) => a * 9,
      make: () => ({ x: rand(0, w), y: rand(0, h), r: rand(1, 3.6), v: rand(0.5, 1.5), ph: rand(0, 6.28) }),
      draw(p) {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        p.y += p.v; p.ph += 0.01; p.x += Math.sin(p.ph) * 0.6;
        if (p.y > h + 5) { p.y = -5; p.x = rand(0, w); }
      },
    },
    stars: {
      count: (a) => a * 11,
      make: () => ({ x: rand(0, w), y: rand(0, h * 0.8), r: rand(0.3, 1.5), t: rand(0, 6.28), s: rand(0.01, 0.04) }),
      draw(p) {
        p.t += p.s;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(p.t))})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      },
    },
    motes: {   // soft floating light specks for sunny days
      count: () => 22,
      make: () => ({ x: rand(0, w), y: rand(0, h), r: rand(2, 7), v: rand(0.15, 0.5), ph: rand(0, 6.28) }),
      draw(p) {
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        p.y -= p.v; p.ph += 0.005; p.x += Math.sin(p.ph) * 0.3;
        if (p.y < -10) { p.y = h + 10; p.x = rand(0, w); }
      },
    },
    clouds: {  // big blurry blobs drifting across
      count: () => 7,
      make: () => ({ x: rand(-200, w), y: rand(0, h * 0.7), r: rand(130, 280), v: rand(0.08, 0.28) }),
      draw(p) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, 'rgba(255,255,255,.17)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        p.x += p.v;
        if (p.x - p.r > w) p.x = -p.r;
      },
    },
  };

  function spawn() {
    const m = modes[mode];
    const area = (w * h) / 1e5;
    parts = Array.from({ length: Math.round(m.count(area)) }, m.make);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spawn();
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    const m = modes[mode];
    for (const p of parts) m.draw(p);
    raf = requestAnimationFrame(frame);
  }

  function scheduleLightning() {
    clearTimeout(flashTimer);
    if (mode !== 'storm' || reduceMotion) return;
    flashTimer = setTimeout(() => {
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 110);
      setTimeout(() => {
        flash.classList.add('on');
        setTimeout(() => flash.classList.remove('on'), 80);
      }, 230);
      scheduleLightning();
    }, rand(4000, 9000));
  }

  function set(next) {
    if (!modes[next]) next = 'none';
    mode = next;
    spawn();
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, w, h);
    if (!reduceMotion && next !== 'none') frame();
    scheduleLightning();
  }

  window.addEventListener('resize', resize);
  resize();
  return { set };
})();

/* ---------- 4. TALKING TO THE APIs ---------- */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function loadWeather(place) {
  const myId = ++state.requestId;
  document.body.classList.add('loading');
  $('dashboard').setAttribute('aria-busy', 'true');
  setStatus('');

  try {
    const imperial = state.unit === 'imperial';
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '7',
      temperature_unit: imperial ? 'fahrenheit' : 'celsius',
      wind_speed_unit: imperial ? 'mph' : 'kmh',
    });

    const data = await fetchJSON(`${WEATHER_URL}?${params}`);
    if (myId !== state.requestId) return;        // a newer request replaced this one

    state.place = place;
    state.data = data;
    save('place', place);
    addRecent(place);
    render();
  } catch (err) {
    if (myId !== state.requestId) return;
    const offline = !navigator.onLine;
    setStatus(offline ? 'You appear to be offline. Check your connection and try again.'
                      : 'Could not load the weather right now. Please try again in a moment.', 'error');
    console.error(err);
  } finally {
    if (myId === state.requestId) {
      document.body.classList.remove('loading');
      $('dashboard').setAttribute('aria-busy', 'false');
    }
  }
}

/* ---------- 5. RENDERING ---------- */

// The API gives local times as text like "2026-10-17T14:00" (no timezone suffix),
// so we read the pieces straight from the string. This avoids timezone bugs.
const minutesOfDay = (s) => { const [hh, mm] = s.split('T')[1].split(':').map(Number); return hh * 60 + mm; };
const fmtHour = (hh) => `${hh % 12 || 12} ${hh >= 12 ? 'PM' : 'AM'}`;
function fmtClock(s) {
  const m = minutesOfDay(s), hh = Math.floor(m / 60), mm = m % 60;
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}
const dateFromStr = (s) => new Date(s.split('T')[0] + 'T12:00:00');   // noon avoids off-by-one-day issues
const fmtDateLong = (s) => dateFromStr(s).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const weekday = (s) => dateFromStr(s).toLocaleDateString(undefined, { weekday: 'short' });

const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
function uvLabel(uv) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}
const setMeter = (id, pct) => { $(id).style.width = clamp(pct, 0, 100) + '%'; };

function applyTheme(code, isDay) {
  const theme = info(code).theme;
  document.body.dataset.theme = theme;
  document.body.dataset.time = isDay ? 'day' : 'night';

  const fxMode = {
    rain: 'rain', storm: 'storm', snow: 'snow', fog: 'clouds', cloudy: 'clouds',
    clear: isDay ? 'motes' : 'stars',
  }[theme];
  FX.set(fxMode);
}

function render() {
  const { current: c, hourly: h, daily: d } = state.data;
  const isDay = c.is_day === 1;
  const imperial = state.unit === 'imperial';
  const meta = info(c.weather_code);
  const deg = imperial ? '°F' : '°C';

  applyTheme(c.weather_code, isDay);

  // Hero
  $('city').textContent = state.place.name;
  $('region').textContent = [state.place.admin1, state.place.country].filter(Boolean).join(', ');
  $('localTime').textContent = `${fmtDateLong(c.time)} · ${fmtClock(c.time)} local time`;
  $('heroIcon').textContent = iconFor(c.weather_code, isDay);
  $('temp').textContent = Math.round(c.temperature_2m);
  $('tempUnit').textContent = deg;
  $('condition').textContent = meta.label;
  $('feels').textContent = Math.round(c.apparent_temperature) + '°';
  $('hi').textContent = Math.round(d.temperature_2m_max[0]) + '°';
  $('lo').textContent = Math.round(d.temperature_2m_min[0]) + '°';
  document.title = `${Math.round(c.temperature_2m)}° ${state.place.name} - Nimbus`;

  // Advice
  const advice = getAdvice(toC(c.apparent_temperature), c.weather_code, d.uv_index_max[0], isDay);
  $('adviceEmoji').textContent = advice.emoji;
  $('advice').textContent = advice.text;

  // Stat tiles
  $('humidity').textContent = c.relative_humidity_2m + '%';
  setMeter('humidityBar', c.relative_humidity_2m);

  $('wind').textContent = `${Math.round(c.wind_speed_10m)} ${imperial ? 'mph' : 'km/h'}`;
  $('windDir').textContent = `from the ${compass(c.wind_direction_10m)}`;
  $('windArrow').style.transform = `rotate(${c.wind_direction_10m + 180}deg)`;  // arrow points where the wind is going

  const uv = d.uv_index_max[0];
  $('uv').textContent = Math.round(uv);
  $('uvLabel').textContent = uvLabel(uv);
  setMeter('uvBar', (uv / 11) * 100);

  $('pressure').textContent = Math.round(c.pressure_msl);

  const rain = d.precipitation_probability_max[0] ?? 0;
  $('rainChance').textContent = rain + '%';
  setMeter('rainBar', rain);

  $('clouds').textContent = c.cloud_cover + '%';
  setMeter('cloudBar', c.cloud_cover);

  renderHourly(h, c);
  renderDaily(d);
  renderSun(d, c);
  renderWalk();
}

function renderHourly(h, c) {
  const nowKey = c.time.slice(0, 13);                       // "2026-10-17T14"
  let start = h.time.findIndex((t) => t.slice(0, 13) >= nowKey);
  if (start < 0) start = 0;

  const html = [];
  for (let i = start; i < start + 24 && i < h.time.length; i++) {
    const hour = Number(h.time[i].slice(11, 13));
    const pop = h.precipitation_probability[i] ?? 0;
    html.push(`
      <div class="hour${i === start ? ' now' : ''}">
        <span class="h-time">${i === start ? 'Now' : fmtHour(hour)}</span>
        <span class="h-icon">${iconFor(h.weather_code[i], h.is_day[i] === 1)}</span>
        <span class="h-temp">${Math.round(h.temperature_2m[i])}°</span>
        <span class="h-rain">${pop >= 20 ? '💧 ' + pop + '%' : ''}</span>
      </div>`);
  }
  $('hourly').innerHTML = html.join('');
  $('hourly').scrollLeft = 0;
}

function renderDaily(d) {
  const gMin = Math.min(...d.temperature_2m_min);
  const gMax = Math.max(...d.temperature_2m_max);
  const span = Math.max(gMax - gMin, 1);

  $('daily').innerHTML = d.time.map((day, i) => {
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
    const left = ((lo - gMin) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 6);
    const pop = d.precipitation_probability_max[i] ?? 0;
    return `
      <li>
        <span class="d-name">${i === 0 ? 'Today' : weekday(day)}</span>
        <span class="d-icon">${iconFor(d.weather_code[i], true)}</span>
        <span class="d-rain">${pop >= 20 ? '💧' + pop + '%' : ''}</span>
        <span class="d-lo">${Math.round(lo)}°</span>
        <span class="d-bar"><i style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i></span>
        <span class="d-hi">${Math.round(hi)}°</span>
      </li>`;
  }).join('');
}

function renderSun(d, c) {
  if (!d.sunrise[0] || !d.sunset[0]) return;   // e.g. polar regions
  const sr = minutesOfDay(d.sunrise[0]);
  const ss = minutesOfDay(d.sunset[0]);
  const now = minutesOfDay(c.time);

  const raw = (now - sr) / (ss - sr);
  const up = raw >= 0 && raw <= 1;
  const p = clamp(raw, 0, 1);

  // Point on the ellipse: centre (150,110), radii 130 x 95
  const x = 150 - 130 * Math.cos(Math.PI * p);
  const y = 110 - 95 * Math.sin(Math.PI * p);

  $('sunDot').setAttribute('cx', x.toFixed(1));
  $('sunDot').setAttribute('cy', y.toFixed(1));
  $('sunDot').classList.toggle('night', !up);
  $('arcProgress').setAttribute('stroke-dasharray', `${(p * 100).toFixed(1)} 100`);

  $('sunrise').textContent = fmtClock(d.sunrise[0]);
  $('sunset').textContent = fmtClock(d.sunset[0]);
  const len = ss - sr;
  $('daylight').textContent = `${Math.floor(len / 60)}h ${len % 60}m of daylight`;
}

function setStatus(msg, type = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (type ? ' ' + type : '');
  el.hidden = !msg;
}

/* ---------- 6. SMART FEATURES ---------- */
const toC = (v) => (state.unit === 'imperial' ? ((v - 32) * 5) / 9 : v);

// Turns numbers into a friendly sentence about what to wear / do.
function getAdvice(feelsC, code, uvMax, isDay) {
  let emoji, text;
  if (feelsC < -10)      { emoji = '🥶'; text = 'Bitterly cold. Layer up and cover your ears, hands and face.'; }
  else if (feelsC < 0)   { emoji = '🧤'; text = 'Freezing out. Heavy coat, gloves and a hat.'; }
  else if (feelsC < 8)   { emoji = '🧥'; text = 'Chilly. A warm jacket is a good idea.'; }
  else if (feelsC < 15)  { emoji = '🧣'; text = 'Cool. A light jacket or hoodie will do.'; }
  else if (feelsC < 22)  { emoji = '👕'; text = 'Comfortable. T-shirt weather.'; }
  else if (feelsC < 28)  { emoji = '😎'; text = 'Warm. Keep it light and drink water.'; }
  else                   { emoji = '🥵'; text = 'Hot. Find shade, hydrate and wear sunscreen.'; }

  const theme = info(code).theme;
  if (theme === 'rain')       { emoji = '☔'; text += ' Bring an umbrella.'; }
  else if (theme === 'snow')  { emoji = '⛄'; text += ' Watch out for slippery paths.'; }
  else if (theme === 'storm') { emoji = '⚡'; text = 'Thunderstorms nearby. Stay indoors if you can.'; }
  else if (theme === 'fog')   { text += ' Visibility is low, so take care if driving.'; }
  else if (isDay && uvMax >= 6) { text += ' UV peaks high today, so wear sunscreen.'; }

  return { emoji, text };
}

// Scans the rest of today's daylight hours and picks the most pleasant one:
// closest to 19°C, lowest chance of rain, and no rain/snow/storm.
function bestHourOutside() {
  const { current: c, hourly: h, daily: d } = state.data;
  if (!d.sunrise[0] || !d.sunset[0]) return null;

  const today = c.time.slice(0, 10);
  const sr = minutesOfDay(d.sunrise[0]);
  const ss = minutesOfDay(d.sunset[0]);
  const nowHour = Number(c.time.slice(11, 13));
  let best = null;

  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(today)) continue;
    const hour = Number(h.time[i].slice(11, 13));
    if (hour < nowHour || hour * 60 < sr || hour * 60 > ss - 30) continue;

    const pop = h.precipitation_probability[i] ?? 0;
    const score = Math.abs(toC(h.temperature_2m[i]) - 19) + pop / 8 + (isWet(h.weather_code[i]) ? 25 : 0);
    if (!best || score < best.score) {
      best = { score, hour, temp: h.temperature_2m[i], pop, code: h.weather_code[i] };
    }
  }
  return best;
}

function renderWalk() {
  const best = bestHourOutside();
  if (!best) {
    $('walkTime').textContent = 'Not today';
    $('walkWhy').textContent = 'No daylight hours left today. Check tomorrow\u2019s forecast below.';
    return;
  }
  $('walkTime').textContent = `Around ${fmtHour(best.hour)}`;
  const base = `${Math.round(best.temp)}° with a ${best.pop}% chance of rain, ${info(best.code).label.toLowerCase()}.`;
  $('walkWhy').textContent = best.score > 20 ? `Not a great day outside, but this is the best window: ${base}` : base;
}

/* ---------- 7. SEARCH, LOCATION, UNITS, RECENT ---------- */
const input = $('searchInput');
const list = $('suggestions');
let debounceId = 0;

const normalizePlace = (r) => ({
  name: r.name, admin1: r.admin1 || '', country: r.country || '', latitude: r.latitude, longitude: r.longitude,
});

async function searchCities(q) {
  const url = `${GEO_URL}?${new URLSearchParams({ name: q, count: 6, language: 'en', format: 'json' })}`;
  const data = await fetchJSON(url);
  return data.results || [];
}

function hideSuggestions() {
  list.hidden = true;
  list.innerHTML = '';
  input.setAttribute('aria-expanded', 'false');
  state.suggestions = [];
  state.activeIdx = -1;
}

function renderSuggestions() {
  list.innerHTML = '';
  if (!state.suggestions.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No matching cities';
    list.appendChild(li);
  }
  state.suggestions.forEach((r, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.className = i === state.activeIdx ? 'active' : '';
    const name = document.createElement('span');
    name.textContent = r.name;
    const sub = document.createElement('small');
    sub.textContent = [r.admin1, r.country].filter(Boolean).join(', ');
    li.append(name, sub);
    li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(r); });
    list.appendChild(li);
  });
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function choose(result) {
  input.value = '';
  hideSuggestions();
  loadWeather(normalizePlace(result));
}

input.addEventListener('input', () => {
  clearTimeout(debounceId);
  const q = input.value.trim();
  if (q.length < 2) { hideSuggestions(); return; }
  debounceId = setTimeout(async () => {
    try {
      const results = await searchCities(q);
      if (input.value.trim() !== q) return;      // user kept typing
      state.suggestions = results;
      state.activeIdx = -1;
      renderSuggestions();
    } catch { hideSuggestions(); }
  }, 300);
});

input.addEventListener('keydown', (e) => {
  if (list.hidden || !state.suggestions.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = state.suggestions.length;
    state.activeIdx = (state.activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    renderSuggestions();
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  if (state.activeIdx >= 0 && state.suggestions[state.activeIdx]) {
    choose(state.suggestions[state.activeIdx]);
    return;
  }
  try {
    const results = state.suggestions.length ? state.suggestions : await searchCities(q);
    if (results.length) choose(results[0]);
    else setStatus(`No city found for "${q}". Check the spelling and try again.`, 'error');
  } catch {
    setStatus('Search failed. Please check your connection.', 'error');
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) hideSuggestions();
});

// "Use my location" button
$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Your browser does not support location access.', 'error');
    return;
  }
  setStatus('Finding your location...');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      let name = 'Your location', admin1 = '', country = '';
      try {
        const r = await fetchJSON(`${REVERSE_URL}?${new URLSearchParams({ latitude, longitude, localityLanguage: 'en' })}`);
        name = r.city || r.locality || name;
        admin1 = r.principalSubdivision || '';
        country = r.countryName || '';
      } catch { /* keep the generic name */ }
      setStatus('');
      loadWeather({ name, admin1, country, latitude, longitude });
    },
    (err) => setStatus(
      err.code === 1 ? 'Location permission was denied. Search for a city instead.'
                     : 'Could not get your location. Try searching for a city.', 'error'),
    { timeout: 10000 }
  );
});

// Units toggle
function syncUnitButtons() {
  document.querySelectorAll('.seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.unit === state.unit);
  });
}
document.querySelectorAll('.seg button').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.unit === state.unit) return;
    state.unit = b.dataset.unit;
    save('unit', state.unit);
    syncUnitButtons();
    if (state.place) loadWeather(state.place);   // refetch so the API converts the units for us
  });
});

// Recent searches (kept in localStorage, max 5)
function addRecent(place) {
  const recent = load('recent', []).filter(
    (p) => !(Math.abs(p.latitude - place.latitude) < 0.01 && Math.abs(p.longitude - place.longitude) < 0.01)
  );
  recent.unshift(place);
  save('recent', recent.slice(0, 5));
  renderRecent();
}

function renderRecent() {
  const box = $('recent');
  box.innerHTML = '';
  load('recent', []).forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = p.name;
    btn.addEventListener('click', () => loadWeather(p));
    box.appendChild(btn);
  });
}

/* ---------- 8. START-UP ---------- */
syncUnitButtons();
renderRecent();
loadWeather(load('place', DEFAULT_PLACE));
