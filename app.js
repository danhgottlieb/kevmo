/* ============================================================
   KevMo Beer Explorer v3 — app.js
   Complete client-side engine (IIFE)
   Expects global: BEER_DATA (Array), Chart (Chart.js)
   ============================================================ */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const PAGE_SIZE = 36;
  const COLORS = [
    '#f0a030', '#5cc8ff', '#4ae08a', '#ffd866', '#f27090',
    '#a77bff', '#ef4444', '#1abc9c', '#f39c12', '#3498db'
  ];
  const RATING_TIERS = [
    'Outstanding', 'Excellent', 'Great', 'Very Good', 'Good',
    'Solid', 'Average', 'Below Average', 'Poor'
  ];
  // Style family keywords— used by presets and style dropdown families
  const STYLE_FAMILY_MAP = {
    'IPA':     ['ipa'],
    'Pale Ale':['pale ale'],
    'Stout':   ['stout'],
    'Porter':  ['porter'],
    'Lager':   ['lager','pilsner','helles','märzen','marzen','bock','dunkel','schwarzbier','vienna lager','dortmund'],
    'Pilsner': ['pilsner'],
    'Wheat':   ['wheat','hefeweizen','witbier','weizen','weisse'],
    'Sour':    ['sour','gose','berliner','lambic','wild ale','gueuze','flanders'],
    'Saison':  ['saison','farmhouse'],
    'Brown Ale':['brown ale'],
    'Red':     ['red ale','amber ale','red ipa','amber'],
    'Belgian': ['belgian','abbey','trappist'],
    'Barleywine':['barleywine','barley wine'],
    'Scotch':  ['scotch ale','wee heavy'],
    'Kölsch':  ['kölsch','kolsch'],
    'Tripel':  ['tripel'],
    'Dubbel':  ['dubbel']
  };

  function matchesFamily(style, familyKey) {
    const terms = STYLE_FAMILY_MAP[familyKey];
    if (!terms) return false;
    const s = (style || '').toLowerCase();
    return terms.some(t => s.includes(t));
  }

  // ── Helpers ────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const _escDiv = document.createElement('div');
  function esc(s) {
    if (s == null) return '';
    _escDiv.textContent = String(s);
    return _escDiv.innerHTML;
  }

  function parseAbv(str) {
    if (!str) return 0;
    const n = parseFloat(String(str).replace('%', ''));
    return isNaN(n) ? 0 : n;
  }

  function ratingClass(simple) {
    if (!simple) return 'rating-other';
    const map = {
      'Outstanding': 'rating-outstanding',
      'Excellent': 'rating-excellent',
      'Great': 'rating-great',
      'Very Good': 'rating-verygood',
      'Good': 'rating-good'
    };
    return map[simple] || 'rating-other';
  }

  function tierIndex(tier) {
    const i = RATING_TIERS.indexOf(tier);
    return i === -1 ? RATING_TIERS.length : i;
  }

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // ── Chart Insight Caption Helper──────────────────────────
  function setInsightCaption(canvasId, text) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var wrapper = canvas.closest('.insight-card');
    if (!wrapper) return;
    var existing = wrapper.querySelector('.insight-caption');
    if (existing) existing.remove();
    var p = document.createElement('p');
    p.className = 'insight-caption';
    p.style.cssText = 'font-size:.78rem;color:var(--text-3);margin:10px 12px 4px;line-height:1.45;border-top:1px solid rgba(255,255,255,.04);padding-top:8px;';
    p.innerHTML = text;
    wrapper.appendChild(p);
  }

  // ── Filter context banner for non-cards views ────────────
  function renderFilterBanner(container) {
    if (!container) return;
    var existing = container.querySelector('.filter-banner');
    if (existing) existing.remove();
    var isFiltered = filters.search || filters.style || filters.region ||
                     filters.rating || filters.abv || filters.ingredient;
    if (!isFiltered) return;
    var parts = [];
    if (filters.search) parts.push('Search: "' + filters.search + '"');
    if (filters.style) {
      parts.push('Style: ' + (filters.style.startsWith('family:') ? 'All ' + filters.style.substring(7) : filters.style));
    }
    if (filters.region) parts.push('Region: ' + filters.region);
    if (filters.rating) parts.push('Rating: ' + filters.rating + '+');
    if (filters.abv) parts.push('ABV: ' + filters.abv);
    if (filters.ingredient) parts.push('Ingredient: ' + filters.ingredient);
    var banner = document.createElement('div');
    banner.className = 'filter-banner';
    banner.style.cssText = 'font-size:.82rem;color:var(--text-2);background:rgba(240,160,48,.08);border:1px solid rgba(240,160,48,.15);border-radius:8px;padding:8px 16px;margin-bottom:14px;text-align:center;line-height:1.5;';
    banner.innerHTML = '🔍 Showing <strong>' + filtered.length.toLocaleString() + ' beers</strong> filtered by: ' + parts.map(function(p) { return '<span style="color:var(--amber-l);font-weight:600">' + esc(p) + '</span>'; }).join(' · ');
    container.insertBefore(banner, container.firstChild);
  }

  // ── Simple linear regression for trendline ────────────────
  function linearRegression(points) {
    var n = points.length;
    if (n < 2) return null;
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) {
      sx += points[i].x;
      sy += points[i].y;
      sxy += points[i].x * points[i].y;
      sxx += points[i].x * points[i].x;
    }
    var denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-10) return null;
    var slope = (n * sxy - sx * sy) / denom;
    var intercept = (sy - slope * sx) / n;
    // Pearson r
    var syy = 0;
    for (var j = 0; j < n; j++) syy += points[j].y * points[j].y;
    var rNum = n * sxy - sx * sy;
    var rDenom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    var r = rDenom > 0 ? rNum / rDenom : 0;
    return { slope: slope, intercept: intercept, r: r };
  }

  // ── Standard deviation helper ─────────────────────────────
  function stdDev(arr) {
    if (arr.length < 2) return 0;
    var m = avg(arr);
    var sumSq = arr.reduce(function(s, v) { return s + (v - m) * (v - m); }, 0);
    return Math.sqrt(sumSq / arr.length);
  }

  // ── Median helper ─────────────────────────────────────────
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function(a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // ── State ──────────────────────────────────────────────────
  const data = (typeof BEER_DATA !== 'undefined' ? BEER_DATA : []).slice();
  // Pre-cache parsed ABV and build id lookup map
  const dataById = new Map();
  data.forEach(function(b) {
    b._abv = parseAbv(b.abv);
    dataById.set(String(b.id), b);
  });
  let filtered = [];
  let currentPage = 1;
  let currentView = 'cards';
  let currentLb = 'breweries';
  let chartsDirty = true;
  let chartInstances = {};
  let debounceTimer = null;

  const filters = {
    search: '',
    style: '',
    region: '',
    rating: '',
    abv: '',
    sort: 'rating-desc',
    ingredient: ''
  };

  // ── URL State Management ──────────────────────────────────
  function saveStateToHash() {
    var parts = [];
    if (currentView !== 'cards') parts.push('v=' + currentView);
    if (filters.search) parts.push('q=' + encodeURIComponent(filters.search));
    if (filters.style) parts.push('style=' + encodeURIComponent(filters.style));
    if (filters.region) parts.push('region=' + encodeURIComponent(filters.region));
    if (filters.rating) parts.push('rating=' + encodeURIComponent(filters.rating));
    if (filters.abv) parts.push('abv=' + encodeURIComponent(filters.abv));
    if (filters.ingredient) parts.push('ing=' + encodeURIComponent(filters.ingredient));
    if (filters.sort !== 'rating-desc') parts.push('sort=' + filters.sort);
    if (currentLb !== 'breweries') parts.push('lb=' + currentLb);
    var hash = parts.length ? '#' + parts.join('&') : '';
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash || window.location.pathname);
    }
  }

  function loadStateFromHash() {
    var hash = window.location.hash.substring(1);
    if (!hash) return false;
    var params = {};
    hash.split('&').forEach(function(p) {
      var kv = p.split('=');
      if (kv.length === 2) params[kv[0]] = decodeURIComponent(kv[1]);
    });
    if (params.q) { filters.search = params.q; dom.searchInput.value = params.q; }
    if (params.style) { filters.style = params.style; dom.filterStyle.value = params.style; }
    if (params.region) { filters.region = params.region; dom.filterRegion.value = params.region; }
    if (params.rating) { filters.rating = params.rating; dom.filterRating.value = params.rating; }
    if (params.abv) { filters.abv = params.abv; dom.filterAbv.value = params.abv; }
    if (params.sort) { filters.sort = params.sort; dom.filterSort.value = params.sort; }
    if (params.ing) filters.ingredient = params.ing;
    var validLbs = ['breweries','styles','regions','hops','spots','gems'];
    if (params.lb && validLbs.indexOf(params.lb) !== -1) currentLb = params.lb;
    var validViews = ['cards','insights','leaderboard','achievements','play'];
    if (params.v && validViews.indexOf(params.v) !== -1) currentView = params.v;
    return true;
  }

  // ── DOM refs ───────────────────────────────────────────────
  const dom = {};
  function cacheDom() {
    dom.heroBeers      = $('#heroBeers');
    dom.heroBreweries  = $('#heroBreweries');
    dom.heroStyles     = $('#heroStyles');
    dom.heroRegions    = $('#heroRegions');
    dom.searchInput    = $('#searchInput');
    dom.filterStyle    = $('#filterStyle');
    dom.filterRegion   = $('#filterRegion');
    dom.filterRating   = $('#filterRating');
    dom.filterAbv      = $('#filterAbv');
    dom.filterSort     = $('#filterSort');
    dom.clearFilters   = $('#clearFilters');
    dom.activePills    = $('#activePills');
    dom.resultCount    = $('#resultCount');
    dom.beerGrid       = $('#beerGrid');
    dom.pagination     = $('#pagination');
    dom.leaderboard    = $('#leaderboardContent');
    dom.achievementsGrid = $('#achievementsGrid');
    dom.modal          = $('#beerModal');
    dom.modalClose     = $('#modalClose');
    dom.modalContent   = $('#modalContent');
    dom.footerCount    = $('#footerCount');
  }

  // ══════════════════════════════════════════════════════════
  //  1. FILTER ENGINE
  // ══════════════════════════════════════════════════════════

  function populateDropdowns() {
    const STYLE_FAMILIES = [
      'IPA', 'Pale Ale', 'Stout', 'Porter', 'Lager', 'Pilsner',
      'Wheat', 'Sour', 'Saison', 'Brown Ale', 'Red', 'Belgian',
      'Barleywine', 'Scotch', 'Kölsch', 'Tripel', 'Dubbel'
    ];

    // Single pass: collect unique styles, regions, and family counts
    const styleSet = new Set();
    const regionSet = new Set();
    const familyCounts = {};
    data.forEach(function(b) {
      if (b.style) {
        styleSet.add(b.style);
        var sl = b.style.toLowerCase();
        for (var fi = 0; fi < STYLE_FAMILIES.length; fi++) {
          var fam = STYLE_FAMILIES[fi];
          var terms = STYLE_FAMILY_MAP[fam];
          if (terms && terms.some(function(t) { return sl.includes(t); })) {
            familyCounts[fam] = (familyCounts[fam] || 0) + 1;
          }
        }
      }
      if (b.state) regionSet.add(b.state);
    });
    const allStyles = [...styleSet].sort();
    const regions = [...regionSet].sort();

    var familyGroup = document.createElement('optgroup');
    familyGroup.label = '── Style Families ──';
    STYLE_FAMILIES.forEach(fam => {
      var count = familyCounts[fam] || 0;
      if (count > 0) {
        var o = document.createElement('option');
        o.value = 'family:' + fam;
        o.textContent = 'All ' + fam + ' (' + count + ')';
        familyGroup.appendChild(o);
      }
    });
    dom.filterStyle.appendChild(familyGroup);

    // Add individual styles
    var indivGroup = document.createElement('optgroup');
    indivGroup.label = '── Individual Styles ──';
    allStyles.forEach(s => {
      var o = document.createElement('option');
      o.value = s; o.textContent = s;
      indivGroup.appendChild(o);
    });
    dom.filterStyle.appendChild(indivGroup);

    regions.forEach(r => {
      var o = document.createElement('option');
      o.value = r; o.textContent = r;
      dom.filterRegion.appendChild(o);
    });
  }

  function applyFilters() {
    const search = filters.search.toLowerCase();
    const ratingThreshold = filters.rating ? tierIndex(filters.rating) : -1;

    filtered = data.filter(b => {
      // Text search — beer name, brewery, style, tasting notes, adjuncts, hops
      if (search) {
        const name = (b.beer || '').toLowerCase();
        const brew = (b.brewery || '').toLowerCase();
        const style = (b.style || '').toLowerCase();
        const notes = (b.tastingNotes || '').toLowerCase();
        const adj = (b.adjuncts || '').toLowerCase();
        const hops = (b.hops || '').toLowerCase();
        if (!name.includes(search) && !brew.includes(search) && !style.includes(search) &&
            !notes.includes(search) && !adj.includes(search) && !hops.includes(search)) return false;
      }
      // Style — supports family: prefix for multi-keyword families
      if (filters.style) {
        if (filters.style.startsWith('family:')) {
          const fam = filters.style.substring(7);
          if (!matchesFamily(b.style, fam)) return false;
        } else {
          if (!(b.style || '').includes(filters.style)) return false;
        }
      }
      // Region
      if (filters.region && b.state !== filters.region) return false;
      // Rating tier
      if (filters.rating) {
        const bi = tierIndex(b.simpleRating);
        if (bi > ratingThreshold) return false;
      }
      // ABV range
      if (filters.abv) {
        const abv = b._abv;
        if (!b.abv || abv === 0) return false; // exclude unknown ABV
        switch (filters.abv) {
          case 'session':  if (abv >= 5) return false; break;
          case 'standard': if (abv < 5 || abv >= 7) return false; break;
          case 'strong':   if (abv < 7 || abv >= 10) return false; break;
          case 'imperial': if (abv < 10) return false; break;
        }
      }
      // Ingredient keyword
      if (filters.ingredient) {
        const kw = filters.ingredient.toLowerCase();
        const haystack = [b.beer, b.tastingNotes, b.adjuncts, b.hops]
          .map(s => (s || '').toLowerCase()).join(' ');
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });

    sortFiltered();
    currentPage = 1;
    chartsDirty = true;
  }

  function sortFiltered() {
    const s = filters.sort;
    filtered.sort((a, b) => {
      switch (s) {
        case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
        case 'rating-asc':  return (a.rating || 0) - (b.rating || 0);
        case 'name-asc':    return (a.beer || '').localeCompare(b.beer || '');
        case 'brewery-asc': return (a.brewery || '').localeCompare(b.brewery || '');
        case 'abv-desc':    return b._abv - a._abv;
        case 'abv-asc':     return a._abv - b._abv;
        default: return 0;
      }
    });
  }

  function onFilterChange() {
    applyFilters();
    renderPills();
    renderCards();
    updateResultCount();
    updateClearButton();
    // Stay on insights/leaderboard (they reflect filters live).
    // Only jump to cards from tabs that don't show filtered data (play, achievements).
    if (currentView === 'play' || currentView === 'achievements') {
      switchView('cards');
    } else if (currentView === 'insights') {
      renderFilterBanner(document.querySelector('#insights-view > .container'));
      renderInsights();
    } else if (currentView === 'leaderboard') {
      renderFilterBanner(document.querySelector('#leaderboard-view > .container'));
      renderLeaderboard();
    }
    saveStateToHash();
  }

  function updateResultCount() {
    const count = filtered.length;
    var statusEl = document.querySelector('.filter-status');
    if (!statusEl) return;
    if (count === data.length) {
      statusEl.innerHTML = '<span id="resultCount">' + count.toLocaleString() + '</span> beers \u2014 showing the full collection';
    } else if (count === 0) {
      statusEl.innerHTML = '<span id="resultCount">0</span> matches \u2014 try loosening those filters';
    } else {
      statusEl.innerHTML = '<span id="resultCount">' + count.toLocaleString() + '</span> beers found';
    }
    // Re-cache since innerHTML replaced the old span
    dom.resultCount = document.getElementById('resultCount');
  }

  function updateClearButton() {
    const active = filters.search || filters.style || filters.region ||
                   filters.rating || filters.abv || filters.ingredient;
    dom.clearFilters.style.display = active ? '' : 'none';
  }

  function clearAllFilters() {
    filters.search = '';
    filters.style = '';
    filters.region = '';
    filters.rating = '';
    filters.abv = '';
    filters.sort = 'rating-desc';
    filters.ingredient = '';
    dom.searchInput.value = '';
    dom.filterStyle.value = '';
    dom.filterRegion.value = '';
    dom.filterRating.value = '';
    dom.filterAbv.value = '';
    dom.filterSort.value = 'rating-desc';
  }

  // ── Filter pills ───────────────────────────────────────────
  function renderPills() {
    let html = '';
    if (filters.search) html += pill('search', 'Search: ' + filters.search);
    if (filters.style) {
      const label = filters.style.startsWith('family:')
        ? 'Style: All ' + filters.style.substring(7)
        : 'Style: ' + filters.style;
      html += pill('style', label);
    }
    if (filters.region) html += pill('region', 'Region: ' + filters.region);
    if (filters.rating) html += pill('rating', 'Rating: ' + filters.rating + '+');
    if (filters.abv) html += pill('abv', 'ABV: ' + filters.abv);
    if (filters.ingredient) html += pill('ingredient', 'Ingredient: ' + filters.ingredient);
    dom.activePills.innerHTML = html;
  }

  function pill(key, label) {
    return '<button class="pill" data-pill="' + esc(key) + '">' +
           esc(label) + ' <span class="pill-x">✕</span></button>';
  }

  function removePill(key) {
    filters[key] = '';
    switch (key) {
      case 'search':  dom.searchInput.value = ''; break;
      case 'style':   dom.filterStyle.value = ''; break;
      case 'region':  dom.filterRegion.value = ''; break;
      case 'rating':  dom.filterRating.value = ''; break;
      case 'abv':     dom.filterAbv.value = ''; break;
      case 'ingredient': break; // no dropdown to reset
    }
    onFilterChange();
  }

  // ── Preset buttons ─────────────────────────────────────────
  function handlePreset(btn) {
    const wasActive = btn.classList.contains('active');
    // Deactivate all presets
    $$('.preset').forEach(p => p.classList.remove('active'));
    clearAllFilters();
    if (wasActive) {
      // Toggle off — just clear
      onFilterChange();
      return;
    }
    // Activate this preset
    btn.classList.add('active');
    const cfg = JSON.parse(btn.getAttribute('data-filter'));
    if (cfg.styleFamily) {
      filters.style = 'family:' + cfg.styleFamily;
      dom.filterStyle.value = 'family:' + cfg.styleFamily;
    }
    if (cfg.ingredient) {
      filters.ingredient = cfg.ingredient;
    }
    if (cfg.abvRange) {
      filters.abv = cfg.abvRange;
      dom.filterAbv.value = cfg.abvRange;
    }
    if (cfg.rating) {
      filters.rating = cfg.rating;
      dom.filterRating.value = cfg.rating;
    }
    onFilterChange();
  }

  // ══════════════════════════════════════════════════════════
  //  2. BEER CARDS
  // ══════════════════════════════════════════════════════════

  function renderCards() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = filtered.slice(start, start + PAGE_SIZE);

    if (!page.length) {
      dom.beerGrid.innerHTML =
        '<div class="empty-state">' +
          '<span class="empty-state-icon">🔍</span>' +
          '<div class="empty-state-msg">Whoa, zero results! Your filters are pickier than Kevin.<br>Try dialing one back — we promise there\'s a banger hiding in&nbsp;here.</div>' +
          '<button class="empty-state-btn" id="emptyStateClear">Clear All Filters</button>' +
        '</div>';
      dom.pagination.innerHTML = '';
      var emptyClrBtn = document.getElementById('emptyStateClear');
      if (emptyClrBtn) {
        emptyClrBtn.addEventListener('click', function() {
          clearAllFilters();
          $$('.preset').forEach(function(p) { p.classList.remove('active'); });
          onFilterChange();
        });
      }
      return;
    }

    dom.beerGrid.innerHTML = page.map(b => {
      const notes = (b.tastingNotes || '').substring(0, 80);
      const truncNotes = notes.length >= 80 ? notes + '…' : notes;
      return '<div class="beer-card" data-id="' + b.id + '" tabindex="0" role="button" aria-label="' + esc(b.beer) + ' by ' + esc(b.brewery) + ', rated ' + (b.rating != null ? b.rating : 'unrated') + '" title="Click to see full details, tasting notes &amp; similar beers">' +
        '<div class="card-top">' +
          '<h3 class="card-name">' + esc(b.beer) + '</h3>' +
          '<p class="card-brewery">' + esc(b.brewery) + '</p>' +
        '</div>' +
        '<div class="card-tags">' +
          (b.style ? '<span class="tag tag-style">' + esc(b.style) + '</span>' : '') +
          (b.abv ? '<span class="tag tag-abv">' + esc(b.abv) + '</span>' : '') +
          (b.state ? '<span class="tag tag-region">' + esc(b.state) + '</span>' : '') +
        '</div>' +
        (truncNotes ? '<p class="card-notes">' + esc(truncNotes) + '</p>' : '') +
        '<div class="card-badge ' + ratingClass(b.simpleRating) + '">' +
          (b.rating != null ? esc(b.rating) : '–') +
          (b.simpleRating ? '<small>' + esc(b.simpleRating) + '</small>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    renderPagination();
  }

  function renderPagination() {
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    if (total <= 1) { dom.pagination.innerHTML = ''; return; }
    dom.pagination.innerHTML =
      '<button class="page-btn" data-page="prev"' + (currentPage <= 1 ? ' disabled' : '') + '>← Previous</button>' +
      '<span class="page-info">Page ' + currentPage + ' of ' + total + ' · ' + filtered.length.toLocaleString() + ' beers</span>' +
      '<button class="page-btn" data-page="next"' + (currentPage >= total ? ' disabled' : '') + '>Next →</button>';
  }

  // ══════════════════════════════════════════════════════════
  //  3. BEER DETAIL MODAL
  // ══════════════════════════════════════════════════════════

  function openModal(beer) {
    if (!beer) return;
    const hopList = (beer.hops && beer.hops !== 'None')
      ? beer.hops.split(',').map(h => h.trim()).filter(Boolean)
      : [];

    var similar = data.filter(
      b => b.id !== beer.id && b.style === beer.style && b.rating != null && b.rating >= 8
    ).slice(0, 6);

    // Brewery deep-dive stats
    var breweryBeers = data.filter(function(b) { return b.brewery === beer.brewery && b.rating != null; });
    var breweryAvg = breweryBeers.length ? avg(breweryBeers.map(function(b) { return b.rating; })) : 0;
    var breweryBest = breweryBeers.slice().sort(function(a,b) { return (b.rating||0)-(a.rating||0); })[0];
    var breweryStyles = [...new Set(breweryBeers.map(function(b) { return b.style; }).filter(Boolean))];

    dom.modalContent.innerHTML =
      '<div class="modal-header">' +
        '<h2>' + esc(beer.beer) + '</h2>' +
        '<p class="modal-brewery">' + esc(beer.brewery) + '</p>' +
        (beer.city || beer.state
          ? '<p class="modal-location">📍 ' + esc([beer.city, beer.state].filter(Boolean).join(', ')) + '</p>'
          : '') +
      '</div>' +
      '<div class="modal-meta">' +
        (beer.style ? '<span class="tag tag-style">' + esc(beer.style) + '</span>' : '') +
        (beer.abv ? '<span class="tag tag-abv">' + esc(beer.abv) + '</span>' : '') +
        (beer.servingType ? '<span class="tag" title="How it was served">' + esc(beer.servingType) + '</span>' : '') +
        (beer.purchased ? '<span class="tag" title="Where it was picked up">' + esc(beer.purchased) + '</span>' : '') +
      '</div>' +
      '<div class="modal-rating-big ' + ratingClass(beer.simpleRating) + '">' +
        '<span class="big-num">' + (beer.rating != null ? esc(beer.rating) : '–') + '</span>' +
        '<span class="big-label">' + esc(beer.simpleRating || 'Not Yet Rated') + '</span>' +
      '</div>' +
      (beer.tastingNotes
        ? '<div class="modal-section"><h4>🍺 Tasting Notes</h4><p>' + esc(beer.tastingNotes) + '</p></div>'
        : '') +
      (beer.adjuncts && beer.adjuncts !== 'None'
        ? '<div class="modal-section"><h4>🧪 Adjuncts &amp; Additions</h4><p>' + esc(beer.adjuncts) + '</p></div>'
        : '') +
      (hopList.length
        ? '<div class="modal-section"><h4>🌿 Hops</h4><div class="hop-tags">' +
          hopList.map(h => '<span class="hop-tag">' + esc(h) + '</span>').join('') +
          '</div></div>'
        : '') +
      // Brewery deep-dive
      (breweryBeers.length > 1
        ? '<div class="modal-section brewery-dive">' +
          '<h4>🏭 More from ' + esc(beer.brewery) + '</h4>' +
          '<div style="display:flex;gap:14px;margin-bottom:10px;font-size:.82rem">' +
            '<div><span style="color:var(--gold);font-weight:700">' + breweryBeers.length + '</span> <span style="color:var(--text-3)">beers tried</span></div>' +
            '<div><span style="color:var(--gold);font-weight:700">' + breweryAvg.toFixed(1) + '</span> <span style="color:var(--text-3)">avg rating</span></div>' +
            '<div><span style="color:var(--gold);font-weight:700">' + breweryStyles.length + '</span> <span style="color:var(--text-3)">styles</span></div>' +
          '</div>' +
          '<div class="similar-chips">' +
            breweryBeers.filter(function(b) { return b.id !== beer.id; })
              .sort(function(a,b) { return (b.rating||0) - (a.rating||0); })
              .slice(0, 6)
              .map(function(b) {
                return '<button class="similar-chip" data-id="' + b.id + '">' +
                  esc(b.beer) + ' <small>(' + (b.rating ? b.rating.toFixed(1) : '–') + ')</small></button>';
              }).join('') +
          '</div>' +
          '<button class="play-btn-secondary brewery-filter-btn" data-brewery="' + esc(beer.brewery) + '" style="margin-top:8px;font-size:.76rem">See all from this brewery →</button>' +
          '</div>'
        : '') +
      (similar.length
        ? '<div class="modal-section"><h4>🔗 If You Liked This, Try</h4><div class="similar-chips">' +
          similar.map(s =>
            '<button class="similar-chip" data-id="' + s.id + '">' +
              esc(s.beer) + ' <small>(' + esc(s.brewery) + ')</small>' +
            '</button>'
          ).join('') +
          '</div></div>'
        : '');

    // Wire up "see all from brewery" button
    var brewBtn = dom.modalContent.querySelector('.brewery-filter-btn');
    if (brewBtn) {
      brewBtn.addEventListener('click', function() {
        closeModal();
        dom.searchInput.value = this.dataset.brewery;
        filters.search = this.dataset.brewery;
        onFilterChange();
        switchView('cards');
      });
    }

    dom.modal.style.display = '';
    document.body.classList.add('modal-open');
    dom._lastFocused = document.activeElement;
    dom.modalClose.focus();
    dom.modal.addEventListener('keydown', trapFocus);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    var focusable = dom.modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function closeModal() {
    dom.modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    dom.modal.removeEventListener('keydown', trapFocus);
    if (dom._lastFocused) { dom._lastFocused.focus(); dom._lastFocused = null; }
  }

  // ══════════════════════════════════════════════════════════
  //  4. INSIGHTS VIEW (Charts) — Redesigned Visualizations
  // ══════════════════════════════════════════════════════════

  // Disable datalabels globally, enable per-chart
  if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
    Chart.defaults.plugins.datalabels = { display: false };
  }

  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        datalabels: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#a0a8be', font: { family: 'Inter', size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#a0a8be', font: { family: 'Inter', size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    };
  }

  function destroyChart(key) {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  }

  function ratingColor(val) {
    if (val >= 9.5) return '#ffd866';
    if (val >= 9)   return '#4ae08a';
    if (val >= 8.5) return '#5cc8ff';
    if (val >= 8)   return '#88bbff';
    if (val >= 7.5) return '#a0a8be';
    return '#636b82';
  }

  function richTooltip(title, lines) {
    return {
      callbacks: {
        title: function(ctx) { return title ? title : ctx[0].label; },
        label: function(ctx) {
          if (typeof lines === 'function') return lines(ctx);
          return ctx.formattedValue;
        }
      },
      backgroundColor: 'rgba(22,24,31,0.95)',
      titleColor: '#ffc96b',
      bodyColor: '#eaedf3',
      borderColor: 'rgba(240,160,48,0.3)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      titleFont: { family: 'Space Grotesk', weight: '700', size: 13 },
      bodyFont: { family: 'Inter', size: 12 },
      displayColors: false
    };
  }

  // ── 1. STYLE EXPLORER — Bubble Chart ──
  function buildStyleBubble(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var map = {};
    rated.forEach(function(b) {
      var s = b.style || 'Unknown';
      if (!map[s]) map[s] = { ratings: [], abvs: [] };
      map[s].ratings.push(b.rating);
      map[s].abvs.push(b._abv);
    });

    var rows = Object.entries(map)
      .filter(function(e) { return e[1].ratings.length >= 3; })
      .map(function(e) {
        var k = e[0], v = e[1];
        var avgR = avg(v.ratings);
        return { label: k, count: v.ratings.length, avg: avgR, avgAbv: avg(v.abvs) };
      })
      .sort(function(a, b) { return b.avg - a.avg; })
      .slice(0, 30);

    if (!rows.length) return;
    var maxCount = Math.max.apply(null, rows.map(function(r) { return r.count; }));

    var dataPoints = rows.map(function(r) {
      return { x: r.count, y: r.avg, r: Math.max(5, Math.sqrt(r.count / maxCount) * 30), label: r.label, avgAbv: r.avgAbv, count: r.count };
    });

    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'Number of Beers', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.title = { display: true, text: 'Avg Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.min = Math.max(6, Math.floor((Math.min.apply(null, rows.map(function(r){return r.avg;})) - 0.3) * 2) / 2);
    opts.scales.y.max = 10;
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var d = dataPoints[ctx.dataIndex];
      return [
        '  Avg Rating: ' + d.y.toFixed(2),
        '  Beers: ' + d.count,
        '  Avg ABV: ' + d.avgAbv.toFixed(1) + '%'
      ];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) {
      return dataPoints[ctx[0].dataIndex].label;
    };
    opts.plugins.datalabels = {
      display: function(ctx) { return dataPoints[ctx.dataIndex].r > 10; },
      formatter: function(val, ctx) {
        var lbl = dataPoints[ctx.dataIndex].label;
        return lbl.length > 18 ? lbl.substring(0, 16) + '…' : lbl;
      },
      color: '#eaedf3',
      font: { family: 'Inter', size: 9, weight: '600' },
      anchor: 'center',
      align: 'center',
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowBlur: 4
    };

    chartInstances[key] = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [{
          data: dataPoints.map(function(d) { return { x: d.x, y: d.y, r: d.r }; }),
          backgroundColor: dataPoints.map(function(d) { return ratingColor(d.y) + '88'; }),
          borderColor: dataPoints.map(function(d) { return ratingColor(d.y); }),
          borderWidth: 2,
          hoverBorderWidth: 3,
          hoverBackgroundColor: dataPoints.map(function(d) { return ratingColor(d.y) + 'cc'; })
        }]
      },
      options: opts
    });

    // Dynamic caption
    if (rows.length >= 2) {
      var topStyle = rows[0];
      var mostTried = rows.slice().sort(function(a,b){return b.count-a.count;})[0];
      var sweetSpot = rows.filter(function(r){return r.count>=5;}).sort(function(a,b){return b.avg-a.avg;})[0];
      var caption = '📊 <strong>' + esc(topStyle.label) + '</strong> leads with a ' + topStyle.avg.toFixed(1) + ' avg. ';
      if (mostTried && mostTried.label !== topStyle.label) {
        caption += '<strong>' + esc(mostTried.label) + '</strong> is the most explored (' + mostTried.count + ' beers). ';
      }
      if (sweetSpot && sweetSpot.label !== topStyle.label) {
        caption += 'Sweet spot: <strong>' + esc(sweetSpot.label) + '</strong> — high rating with solid sample size.';
      }
      setInsightCaption(canvasId, caption);
    }
  }

  // ── 2. BREWERY LANDSCAPE — Scatter Plot ──
  function buildBreweryScatter(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var map = {};
    rated.forEach(function(b) {
      var s = b.brewery || 'Unknown';
      if (!map[s]) map[s] = [];
      map[s].push(b.rating);
    });

    var rows = Object.entries(map)
      .filter(function(e) { return e[1].length >= 3; })
      .map(function(e) {
        var k = e[0], v = e[1];
        var sorted = v.slice().sort(function(a,b){return a-b;});
        var stdDev = Math.sqrt(v.map(function(x){var m=avg(v);return(x-m)*(x-m);}).reduce(function(a,b){return a+b;},0)/v.length);
        return { label: k, count: v.length, avg: avg(v), min: sorted[0], max: sorted[sorted.length-1], stdDev: stdDev };
      })
      .sort(function(a, b) { return b.avg - a.avg; })
      .slice(0, 40);

    if (!rows.length) return;
    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'Number of Beers', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.title = { display: true, text: 'Avg Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.min = Math.max(6, Math.floor((Math.min.apply(null, rows.map(function(r){return r.avg;})) - 0.5) * 2) / 2);
    opts.scales.y.max = 10;
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var d = rows[ctx.dataIndex];
      return [
        '  Avg Rating: ' + d.avg.toFixed(2),
        '  Beers: ' + d.count,
        '  Range: ' + d.min.toFixed(1) + ' – ' + d.max.toFixed(1),
        '  Consistency: ±' + d.stdDev.toFixed(2)
      ];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) { return rows[ctx[0].dataIndex].label; };
    opts.plugins.datalabels = {
      display: function(ctx) { return rows[ctx.dataIndex].count >= 8; },
      formatter: function(val, ctx) {
        var lbl = rows[ctx.dataIndex].label;
        return lbl.length > 20 ? lbl.substring(0, 18) + '…' : lbl;
      },
      color: '#eaedf3',
      font: { family: 'Inter', size: 9, weight: '600' },
      anchor: 'end',
      align: 'top',
      offset: 4,
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowBlur: 4
    };

    chartInstances[key] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data: rows.map(function(r) { return { x: r.count, y: r.avg }; }),
          backgroundColor: rows.map(function(r) { return ratingColor(r.avg) + '99'; }),
          borderColor: rows.map(function(r) { return ratingColor(r.avg); }),
          borderWidth: 2,
          pointRadius: rows.map(function(r) { return Math.max(5, Math.sqrt(r.count) * 2.5); }),
          pointHoverRadius: rows.map(function(r) { return Math.max(7, Math.sqrt(r.count) * 3); }),
          hoverBorderWidth: 3
        }]
      },
      options: opts
    });

    // Dynamic caption
    if (rows.length >= 3) {
      var topBrew = rows[0];
      var mostConsistent = rows.filter(function(r){return r.count>=5;}).sort(function(a,b){return a.stdDev - b.stdDev;})[0];
      var mostExplored = rows.slice().sort(function(a,b){return b.count-a.count;})[0];
      var caption = '📊 <strong>' + esc(topBrew.label) + '</strong> tops with ' + topBrew.avg.toFixed(1) + ' avg across ' + topBrew.count + ' beers. ';
      if (mostConsistent && mostConsistent.label !== topBrew.label) {
        caption += 'Most consistent: <strong>' + esc(mostConsistent.label) + '</strong> (±' + mostConsistent.stdDev.toFixed(2) + '). ';
      }
      if (mostExplored) {
        caption += 'Most explored: <strong>' + esc(mostExplored.label) + '</strong> (' + mostExplored.count + ' beers).';
      }
      setInsightCaption(canvasId, caption);
    }
  }

  // ── 3. RATING DISTRIBUTION — Gradient Histogram ──
  function buildRatingHistogram(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var buckets = {};
    rated.forEach(function(b) {
      var key2 = (Math.round(b.rating * 2) / 2).toFixed(1);
      buckets[key2] = (buckets[key2] || 0) + 1;
    });
    var keys = Object.keys(buckets).map(Number).sort(function(a,b){return a-b;});
    if (!keys.length) return;
    var values = keys.map(function(k) { return buckets[k.toFixed(1)]; });
    var maxVal = Math.max.apply(null, values);

    var colors = keys.map(function(k) { return ratingColor(k); });

    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.title = { display: true, text: 'Count', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.x.grid = { display: false };
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var pct = (ctx.raw / rated.length * 100).toFixed(1);
      return ['  ' + ctx.raw + ' beers (' + pct + '%)'];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) { return 'Rating: ' + ctx[0].label; };
    opts.plugins.datalabels = {
      display: function(ctx) { return values[ctx.dataIndex] > maxVal * 0.15; },
      formatter: function(val) { return val; },
      color: '#eaedf3',
      font: { family: 'Inter', size: 10, weight: '700' },
      anchor: 'end',
      align: 'end',
      offset: -2
    };

    chartInstances[key] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: keys.map(function(k) { return k.toFixed(1); }),
        datasets: [{
          data: values,
          backgroundColor: colors.map(function(c) { return c + 'aa'; }),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: opts
    });
  }

  // ── 4. ABV vs RATING — Scatter Correlation ──
  function buildAbvScatter(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // Sample if too many points
    var points = rated.filter(function(b) { return b._abv > 0; });
    if (points.length > 500) {
      var step = Math.ceil(points.length / 500);
      points = points.filter(function(_, i) { return i % step === 0; });
    }

    var scatterData = points.map(function(b) {
      return { x: b._abv, y: b.rating };
    });

    if (!scatterData.length) return;
    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'ABV %', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.title = { display: true, text: 'Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.x.min = 0;
    opts.scales.y.min = Math.max(4, Math.floor(Math.min.apply(null, scatterData.map(function(d){return d.y;}))));
    opts.scales.y.max = 10;
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var b = points[ctx.dataIndex];
      return [
        '  ' + (b.beer || 'Unknown'),
        '  ' + (b.brewery || ''),
        '  ABV: ' + b.abv + '  Rating: ' + b.rating
      ];
    });
    opts.plugins.tooltip.callbacks.title = function() { return 'Beer Details'; };

    // Compute trendline
    var reg = linearRegression(scatterData);
    var trendDatasets = [{
          data: scatterData,
          backgroundColor: scatterData.map(function(d) { return ratingColor(d.y) + '55'; }),
          borderColor: scatterData.map(function(d) { return ratingColor(d.y) + '99'; }),
          borderWidth: 1,
          pointRadius: 3.5,
          pointHoverRadius: 7,
          hoverBorderWidth: 2
    }];

    if (reg && scatterData.length >= 10) {
      var xVals = scatterData.map(function(d){return d.x;});
      var xMin = Math.min.apply(null, xVals);
      var xMax = Math.max.apply(null, xVals);
      trendDatasets.push({
        type: 'line',
        data: [{x: xMin, y: reg.slope * xMin + reg.intercept}, {x: xMax, y: reg.slope * xMax + reg.intercept}],
        borderColor: '#f0a030',
        borderWidth: 2,
        borderDash: [8, 4],
        pointRadius: 0,
        fill: false
      });
    }

    chartInstances[key] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: trendDatasets
      },
      options: opts
    });

    // Dynamic caption
    if (reg && scatterData.length >= 10) {
      var direction = reg.slope > 0.02 ? 'positive' : reg.slope < -0.02 ? 'negative' : 'negligible';
      var strength = Math.abs(reg.r);
      var strengthLabel = strength > 0.5 ? 'moderate-to-strong' : strength > 0.25 ? 'weak' : 'very weak';
      var caption = '📊 Trendline (dashed): <strong>' + direction + '</strong> correlation (r=' + reg.r.toFixed(2) + ', ' + strengthLabel + '). ';
      if (direction === 'positive') {
        caption += 'Higher ABV beers tend to get slightly better ratings — likely because barrel-aged and imperial styles bring complexity.';
      } else if (direction === 'negative') {
        caption += 'Higher ABV doesn\'t automatically mean better — quality comes at every strength level.';
      } else {
        caption += 'ABV has almost no relationship with rating — great beers come at every strength level.';
      }
      setInsightCaption(canvasId, caption);
    }
  }

  // ── 5. REGIONS — Horizontal Lollipop Chart ──
  function buildRegionLollipop(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var map = {};
    rated.forEach(function(b) {
      var s = b.state || 'Unknown';
      if (!map[s]) map[s] = [];
      map[s].push(b.rating);
    });

    var rows = Object.entries(map)
      .filter(function(e) { return e[1].length >= 5; })
      .map(function(e) { return { label: e[0], avg: avg(e[1]), count: e[1].length }; })
      .sort(function(a, b) { return b.avg - a.avg; })
      .slice(0, 15);

    if (!rows.length) return;
    var labels = rows.map(function(r) { return r.label; });
    var values = rows.map(function(r) { return +r.avg.toFixed(2); });
    var minVal = Math.max(6, Math.floor((Math.min.apply(null, values) - 0.3) * 2) / 2);

    var opts = chartDefaults();
    opts.indexAxis = 'y';
    opts.scales.x.min = minVal;
    opts.scales.x.max = 10;
    opts.scales.x.title = { display: true, text: 'Avg Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.ticks.font = { family: 'Inter', size: 11 };
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var r = rows[ctx.dataIndex];
      return ['  Avg: ' + r.avg.toFixed(2), '  Beers: ' + r.count];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) { return rows[ctx[0].dataIndex].label; };
    opts.plugins.datalabels = {
      display: true,
      formatter: function(val, ctx) { return rows[ctx.dataIndex].count + ' beers'; },
      color: '#a0a8be',
      font: { family: 'Inter', size: 9, weight: '600' },
      anchor: 'end',
      align: 'right',
      offset: 4
    };

    // Lollipop: thin bar + point overlay
    chartInstances[key] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: rows.map(function(r) { return ratingColor(r.avg) + '66'; }),
          borderColor: rows.map(function(r) { return ratingColor(r.avg); }),
          borderWidth: 0,
          borderRadius: 20,
          barThickness: 8,
          borderSkipped: false
        }]
      },
      options: opts,
      plugins: [{
        id: 'lollipopDots',
        afterDatasetsDraw: function(chart) {
          var meta = chart.getDatasetMeta(0);
          var ctxC = chart.ctx;
          meta.data.forEach(function(bar, i) {
            var x = bar.x;
            var y = bar.y;
            ctxC.save();
            ctxC.beginPath();
            var dotR = Math.max(4, Math.min(10, Math.sqrt(rows[i].count) * 1.2));
            ctxC.arc(x, y, dotR, 0, Math.PI * 2);
            ctxC.fillStyle = ratingColor(rows[i].avg);
            ctxC.fill();
            ctxC.strokeStyle = ratingColor(rows[i].avg);
            ctxC.lineWidth = 2;
            ctxC.stroke();
            ctxC.restore();
          });
        }
      }]
    });

    // Dynamic caption
    if (rows.length >= 3) {
      var topRegion = rows[0];
      var biggestVolume = rows.slice().sort(function(a,b){return b.count-a.count;})[0];
      var caption = '📊 <strong>' + esc(topRegion.label) + '</strong> leads quality (' + topRegion.avg.toFixed(1) + ' avg). ';
      if (biggestVolume && biggestVolume.label !== topRegion.label) {
        caption += '<strong>' + esc(biggestVolume.label) + '</strong> has the most volume (' + biggestVolume.count + ' beers, ' + biggestVolume.avg.toFixed(1) + ' avg). ';
      }
      caption += 'Dot size shows sample count — bigger dots = more reliable rankings.';
      setInsightCaption(canvasId, caption);
    }
  }

  // ── 6. HOPS — Bubble Chart ──
  function buildHopBubble(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var map = {};
    rated.forEach(function(b) {
      if (!b.hops || b.hops === 'None') return;
      b.hops.split(',').forEach(function(h) {
        h = h.trim();
        if (!h) return;
        if (!map[h]) map[h] = [];
        map[h].push(b.rating);
      });
    });

    var rows = Object.entries(map)
      .filter(function(e) { return e[1].length >= 2; })
      .map(function(e) { return { label: e[0], count: e[1].length, avg: avg(e[1]) }; })
      .sort(function(a, b) { return b.avg - a.avg; })
      .slice(0, 20);

    if (!rows.length) return;
    var maxCount = Math.max.apply(null, rows.map(function(r) { return r.count; }));

    var dataPoints = rows.map(function(r, i) {
      return { x: r.count, y: r.avg, r: Math.max(5, Math.sqrt(r.count / maxCount) * 25), label: r.label, count: r.count };
    });

    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'Frequency', color: '#7f87a0', font: { family: 'Space Grotesk', size: 11 } };
    opts.scales.y.title = { display: true, text: 'Avg Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 11 } };
    opts.scales.y.min = Math.max(6, Math.floor((Math.min.apply(null, rows.map(function(r){return r.avg;})) - 0.3) * 2) / 2);
    opts.scales.y.max = 10;
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var d = dataPoints[ctx.dataIndex];
      return ['  Avg: ' + d.y.toFixed(2), '  Used in: ' + d.count + ' beers'];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) { return dataPoints[ctx[0].dataIndex].label; };
    opts.plugins.datalabels = {
      display: function(ctx) { return dataPoints[ctx.dataIndex].r > 8; },
      formatter: function(val, ctx) { return dataPoints[ctx.dataIndex].label; },
      color: '#eaedf3',
      font: { family: 'Inter', size: 9, weight: '600' },
      anchor: 'center',
      align: 'center',
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowBlur: 4
    };

    chartInstances[key] = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [{
          data: dataPoints.map(function(d) { return { x: d.x, y: d.y, r: d.r }; }),
          backgroundColor: dataPoints.map(function(d) { return '#4ae08a77'; }),
          borderColor: dataPoints.map(function(d) { return '#4ae08a'; }),
          borderWidth: 2,
          hoverBorderWidth: 3,
          hoverBackgroundColor: '#4ae08abb'
        }]
      },
      options: opts
    });
  }

  // ── 7. TASTING NOTES — Bubble Chart ──
  function buildNotesBubble(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var EXTRA_NOISE = new Set([
      'and', 'with', 'the', 'some', 'light', 'little', 'bit', 'very',
      'good', 'great', 'nice', 'notes', 'note', 'hint', 'flavor', 'slight',
      'but', 'not', 'has', 'had', 'also', 'this', 'one', 'like', 'more',
      'than', 'from', 'for', 'just', 'really', 'pretty', 'much', 'well',
      'was', 'are', 'lot', 'its', 'beer', 'taste', 'drink', 'overall',
      'think', 'would', 'could', 'got', 'big', 'bit', 'get', 'into'
    ]);
    var map = {};
    rated.forEach(function(b) {
      if (!b.tastingNotes) return;
      var text = b.tastingNotes.toLowerCase().replace(/[^a-z\s]/g, '');
      var words = text.split(/\s+/).filter(function(w) { return w.length > 2 && !EXTRA_NOISE.has(w); });
      var keys = new Set();
      words.forEach(function(w) { keys.add(w); });
      for (var i = 0; i < words.length - 1; i++) { keys.add(words[i] + ' ' + words[i + 1]); }
      keys.forEach(function(w) {
        if (!map[w]) map[w] = [];
        map[w].push(b.rating);
      });
    });

    var rows = Object.entries(map)
      .filter(function(e) {
        if (e[0].includes(' ')) return e[1].length >= 3;
        return e[1].length >= 8;
      })
      .map(function(e) { return { label: e[0], count: e[1].length, avg: avg(e[1]) }; })
      .sort(function(a, b) { return b.avg - a.avg; })
      .slice(0, 25);

    if (!rows.length) return;
    var maxCount = Math.max.apply(null, rows.map(function(r) { return r.count; }));

    var dataPoints = rows.map(function(r) {
      return { x: r.count, y: r.avg, r: Math.max(5, Math.sqrt(r.count / maxCount) * 25), label: r.label, count: r.count };
    });

    var noteColors = ['#f27090', '#a77bff', '#5cc8ff', '#ffd866', '#4ae08a'];

    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'Mentions', color: '#7f87a0', font: { family: 'Space Grotesk', size: 11 } };
    opts.scales.y.title = { display: true, text: 'Avg Rating', color: '#7f87a0', font: { family: 'Space Grotesk', size: 11 } };
    opts.scales.y.min = Math.max(6, Math.floor((Math.min.apply(null, rows.map(function(r){return r.avg;})) - 0.3) * 2) / 2);
    opts.scales.y.max = 10;
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      var d = dataPoints[ctx.dataIndex];
      return ['  Avg: ' + d.y.toFixed(2), '  Mentioned: ' + d.count + '×'];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) { return '"' + dataPoints[ctx[0].dataIndex].label + '"'; };
    opts.plugins.datalabels = {
      display: function(ctx) { return dataPoints[ctx.dataIndex].r > 8; },
      formatter: function(val, ctx) { return dataPoints[ctx.dataIndex].label; },
      color: '#eaedf3',
      font: { family: 'Inter', size: 9, weight: '600' },
      anchor: 'center',
      align: 'center',
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowBlur: 4
    };

    chartInstances[key] = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [{
          data: dataPoints.map(function(d) { return { x: d.x, y: d.y, r: d.r }; }),
          backgroundColor: dataPoints.map(function(d, i) { return noteColors[i % noteColors.length] + '77'; }),
          borderColor: dataPoints.map(function(d, i) { return noteColors[i % noteColors.length]; }),
          borderWidth: 2,
          hoverBorderWidth: 3
        }]
      },
      options: opts
    });
  }

  // ── 8. NEW: Style Family Radar ──
  function buildStyleRadar(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var families = ['IPA', 'Stout', 'Lager', 'Sour', 'Wheat', 'Belgian', 'Pale Ale', 'Porter'];
    var familyData = families.map(function(fam) {
      var beers = rated.filter(function(b) { return matchesFamily(b.style, fam); });
      if (beers.length === 0) return { label: fam, avg: 0, count: 0, avgAbv: 0 };
      return {
        label: fam,
        avg: avg(beers.map(function(b) { return b.rating; })),
        count: beers.length,
        avgAbv: avg(beers.filter(function(b){return b._abv>0;}).map(function(b) { return b._abv; }))
      };
    });

    var maxCount = Math.max.apply(null, familyData.map(function(d) { return d.count; }));

    var opts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      scales: {
        r: {
          angleLines: { color: 'rgba(255,255,255,0.06)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { color: '#a0a8be', font: { family: 'Space Grotesk', size: 11, weight: '600' } },
          ticks: { display: false },
          suggestedMin: 0
        }
      },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#a0a8be', font: { family: 'Inter', size: 11 }, boxWidth: 12, padding: 16 } },
        tooltip: richTooltip(null, function(ctx) {
          var d = familyData[ctx.dataIndex];
          return ['  ' + d.label, '  Beers: ' + d.count, '  Avg Rating: ' + d.avg.toFixed(2), '  Avg ABV: ' + d.avgAbv.toFixed(1) + '%'];
        }),
        datalabels: { display: false }
      }
    };
    opts.plugins.tooltip.callbacks.title = function(ctx) { return ctx[0].dataset.label; };

    chartInstances[key] = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: families,
        datasets: [
          {
            label: 'Avg Rating',
            data: familyData.map(function(d) { return +d.avg.toFixed(2); }),
            backgroundColor: 'rgba(240,160,48,0.15)',
            borderColor: '#f0a030',
            borderWidth: 2,
            pointBackgroundColor: '#f0a030',
            pointBorderColor: '#f0a030',
            pointRadius: 4,
            pointHoverRadius: 7
          },
          {
            label: 'Beer Count (normalized)',
            data: familyData.map(function(d) { return maxCount > 0 ? +(d.count / maxCount * 10).toFixed(2) : 0; }),
            backgroundColor: 'rgba(92,200,255,0.10)',
            borderColor: '#5cc8ff',
            borderWidth: 2,
            pointBackgroundColor: '#5cc8ff',
            pointBorderColor: '#5cc8ff',
            pointRadius: 4,
            pointHoverRadius: 7
          }
        ]
      },
      options: opts
    });
  }

  // ── 9. NEW: Rating Tier Doughnut ──
  function buildRatingDoughnut(canvasId, rated) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var tierCounts = {};
    RATING_TIERS.forEach(function(t) { tierCounts[t] = 0; });
    rated.forEach(function(b) {
      var t = b.simpleRating || 'Unknown';
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    });

    var tiers = RATING_TIERS.filter(function(t) { return (tierCounts[t] || 0) > 0; });
    var counts = tiers.map(function(t) { return tierCounts[t]; });
    var tierColors = {
      'Outstanding': '#ffd866', 'Excellent': '#4ae08a', 'Great': '#5cc8ff',
      'Very Good': '#88bbff', 'Good': '#a0a8be', 'Solid': '#7f87a0',
      'Average': '#636b82', 'Below Average': '#4a4f5e', 'Poor': '#ef4444'
    };
    var bgColors = tiers.map(function(t) { return (tierColors[t] || '#636b82') + 'cc'; });
    var borderColors = tiers.map(function(t) { return tierColors[t] || '#636b82'; });

    var opts = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      animation: { animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { color: '#a0a8be', font: { family: 'Inter', size: 11 }, boxWidth: 12, padding: 10, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var pct = (ctx.raw / rated.length * 100).toFixed(1);
              return '  ' + ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
            }
          },
          backgroundColor: 'rgba(22,24,31,0.95)',
          titleColor: '#ffc96b', bodyColor: '#eaedf3',
          borderColor: 'rgba(240,160,48,0.3)', borderWidth: 1,
          padding: 12, cornerRadius: 8,
          bodyFont: { family: 'Inter', size: 12 }
        },
        datalabels: {
          display: function(ctx) { return counts[ctx.dataIndex] / rated.length > 0.05; },
          formatter: function(val) { return val; },
          color: '#eaedf3',
          font: { family: 'Space Grotesk', size: 12, weight: '700' },
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowBlur: 4
        }
      }
    };

    chartInstances[key] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: tiers,
        datasets: [{
          data: counts,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: opts
    });
  }

  // ── 10. NEW: ABV Density by Style Family ──
  function buildAbvDensity(canvasId, beers) {
    var key = canvasId;
    destroyChart(key);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var abvBins = ['<4%','4-5%','5-6%','6-7%','7-8%','8-10%','10-12%','12%+'];
    var topFamilies = ['IPA','Stout','Lager','Sour','Wheat'];
    var famColors = { 'IPA':'#f0a030', 'Stout':'#a77bff', 'Lager':'#5cc8ff', 'Sour':'#f27090', 'Wheat':'#4ae08a' };

    function binIndex(abv) {
      if (abv < 4) return 0;
      if (abv < 5) return 1;
      if (abv < 6) return 2;
      if (abv < 7) return 3;
      if (abv < 8) return 4;
      if (abv < 10) return 5;
      if (abv < 12) return 6;
      return 7;
    }

    var datasets = topFamilies.map(function(fam) {
      var counts = new Array(8).fill(0);
      beers.forEach(function(b) {
        if (!matchesFamily(b.style, fam)) return;
        var abv = b._abv;
        if (abv <= 0) return;
        counts[binIndex(abv)]++;
      });
      var c = famColors[fam];
      return {
        label: fam,
        data: counts,
        backgroundColor: c + '44',
        borderColor: c,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: c
      };
    });

    var opts = chartDefaults();
    opts.scales.x.title = { display: true, text: 'ABV Range', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.title = { display: true, text: 'Beer Count', color: '#7f87a0', font: { family: 'Space Grotesk', size: 12 } };
    opts.scales.y.beginAtZero = true;
    opts.plugins.legend = { display: true, position: 'top', labels: { color: '#a0a8be', font: { family: 'Inter', size: 11 }, boxWidth: 12, padding: 16, usePointStyle: true } };
    opts.plugins.tooltip = richTooltip(null, function(ctx) {
      return ['  ' + ctx.dataset.label + ': ' + ctx.raw + ' beers'];
    });
    opts.plugins.tooltip.callbacks.title = function(ctx) { return 'ABV: ' + ctx[0].label; };
    opts.interaction = { mode: 'index', intersect: false };

    chartInstances[key] = new Chart(ctx, {
      type: 'line',
      data: { labels: abvBins, datasets: datasets },
      options: opts
    });
  }

  // ── Master render function ──
  function renderInsights() {
    // Always rebuild charts with current filtered data
    var rated = filtered.filter(function(b) { return b.rating != null; });

    buildStyleBubble('chartStyles', rated);
    buildBreweryScatter('chartBreweries', rated);
    buildRatingHistogram('chartRatings', rated);
    buildAbvScatter('chartAbv', rated);
    buildRegionLollipop('chartRegions', rated);
    buildHopBubble('chartHops', rated);
    buildNotesBubble('chartNotes', rated);
    buildStyleRadar('chartRadar', rated);
    buildRatingDoughnut('chartDoughnut', rated);
    buildAbvDensity('chartAbvDensity', filtered);
    renderSurpriseBeers(rated);
  }

  // ── Surprise Beers: Z-Score Outlier Detection ──
  function renderSurpriseBeers(rated) {
    var container = document.getElementById('surpriseBeersContent');
    if (!container) return;

    // Compute style averages and standard deviations
    var styleMap = {};
    rated.forEach(function(b) {
      var s = b.style || 'Unknown';
      if (!styleMap[s]) styleMap[s] = [];
      styleMap[s].push(b.rating);
    });
    var styleStats = {};
    Object.entries(styleMap).forEach(function(e) {
      if (e[1].length >= 5) {
        styleStats[e[0]] = { avg: avg(e[1]), sd: stdDev(e[1]), count: e[1].length };
      }
    });

    // Find outliers using z-scores (≥1.8σ from style mean)
    var Z_THRESHOLD = 1.8;
    var outliers = rated.filter(function(b) {
      var ss = styleStats[b.style];
      if (!ss || ss.sd < 0.15) return false; // skip styles with near-zero variance
      var z = (b.rating - ss.avg) / ss.sd;
      return Math.abs(z) >= Z_THRESHOLD;
    }).map(function(b) {
      var ss = styleStats[b.style];
      var z = (b.rating - ss.avg) / ss.sd;
      return { beer: b, diff: b.rating - ss.avg, z: z, styleAvg: ss.avg, styleSd: ss.sd, styleCount: ss.count };
    }).sort(function(a, b) { return Math.abs(b.z) - Math.abs(a.z); });

    var overachievers = outliers.filter(function(o) { return o.z > 0; }).slice(0, 5);
    var underachievers = outliers.filter(function(o) { return o.z < 0; }).slice(0, 5);

    if (!overachievers.length && !underachievers.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:12px;font-size:.85rem">No major outliers in the current selection — Kevin is remarkably consistent here.</div>';
      return;
    }

    var html = '<div style="font-size:.72rem;color:var(--text-3);margin-bottom:10px;text-align:center;font-style:italic">Using z-score analysis (\u22651.8\u03C3 from style mean, min 5 beers/style) to find statistically surprising ratings.</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    html += '<div><h4 style="font-size:.78rem;font-weight:700;color:var(--green);margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">\u2B06 Overachievers</h4>';
    overachievers.forEach(function(o) {
      var b = o.beer;
      html += '<div class="outlier-row" data-id="' + b.id + '" style="cursor:pointer;padding:8px 10px;border-radius:8px;background:rgba(74,224,138,.04);border:1px solid rgba(74,224,138,.1);margin-bottom:6px;transition:all .15s">' +
        '<div style="font-weight:700;font-size:.85rem;color:var(--amber-l)">' + esc(b.beer) + '</div>' +
        '<div style="font-size:.76rem;color:var(--text-3)">' + esc(b.brewery) + ' \u00B7 ' + esc(b.style) + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;font-size:.76rem">' +
          '<span style="color:var(--gold);font-weight:700">Rated: ' + b.rating.toFixed(1) + '</span>' +
          '<span style="color:var(--text-3)">Style: ' + o.styleAvg.toFixed(1) + ' \u00B1' + o.styleSd.toFixed(1) + ' (' + o.styleCount + ' beers)</span>' +
          '<span style="color:var(--green);font-weight:600">z=+' + o.z.toFixed(1) + '</span>' +
        '</div></div>';
    });
    html += '</div>';

    html += '<div><h4 style="font-size:.78rem;font-weight:700;color:var(--pink);margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em">\u2B07 Underachievers</h4>';
    underachievers.forEach(function(o) {
      var b = o.beer;
      html += '<div class="outlier-row" data-id="' + b.id + '" style="cursor:pointer;padding:8px 10px;border-radius:8px;background:rgba(242,112,144,.04);border:1px solid rgba(242,112,144,.1);margin-bottom:6px;transition:all .15s">' +
        '<div style="font-weight:700;font-size:.85rem;color:var(--amber-l)">' + esc(b.beer) + '</div>' +
        '<div style="font-size:.76rem;color:var(--text-3)">' + esc(b.brewery) + ' \u00B7 ' + esc(b.style) + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;font-size:.76rem">' +
          '<span style="color:var(--gold);font-weight:700">Rated: ' + b.rating.toFixed(1) + '</span>' +
          '<span style="color:var(--text-3)">Style: ' + o.styleAvg.toFixed(1) + ' \u00B1' + o.styleSd.toFixed(1) + ' (' + o.styleCount + ' beers)</span>' +
          '<span style="color:var(--pink);font-weight:600">z=' + o.z.toFixed(1) + '</span>' +
        '</div></div>';
    });
    html += '</div></div>';

    container.innerHTML = html;

    // Click to open beer modal
    container.querySelectorAll('.outlier-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var beer = dataById.get(row.dataset.id);
        if (beer) openModal(beer);
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  5. LEADERBOARD VIEW (Enhanced)
  // ══════════════════════════════════════════════════════════

  // ── Leaderboard "Did you know?" callout ────────────────
  function renderLeaderboardDidYouKnow() {
    var existing = document.getElementById('lbDidYouKnow');
    if (existing) existing.remove();

    var rated = filtered.filter(function(b) { return b.rating != null; });
    var fact = '';

    if (currentLb === 'breweries') {
      var brewMap = {};
      rated.forEach(function(b) {
        if (!brewMap[b.brewery]) brewMap[b.brewery] = [];
        brewMap[b.brewery].push(b.rating);
      });
      var entries = Object.entries(brewMap).filter(function(e) { return e[1].length >= 5; });
      if (entries.length) {
        var mostConsistent = entries.map(function(e) {
          return { name: e[0], sd: stdDev(e[1]), count: e[1].length };
        }).sort(function(a, b) { return a.sd - b.sd; })[0];
        fact = '🎯 <strong>Most consistent brewery:</strong> ' + esc(mostConsistent.name) +
          ' (±' + mostConsistent.sd.toFixed(2) + ' across ' + mostConsistent.count + ' beers) — Kevin always knows what he\'s getting.';
      }
    } else if (currentLb === 'styles') {
      var styleMap = {};
      rated.forEach(function(b) {
        if (!styleMap[b.style]) styleMap[b.style] = [];
        styleMap[b.style].push(b.rating);
      });
      var styleEntries = Object.entries(styleMap).filter(function(e) { return e[1].length >= 10; });
      if (styleEntries.length) {
        var widestRange = styleEntries.map(function(e) {
          var s = e[1].slice().sort(function(a,b){return a-b;});
          return { name: e[0], range: s[s.length-1] - s[0], count: e[1].length };
        }).sort(function(a, b) { return b.range - a.range; })[0];
        fact = '📏 <strong>Widest rating range:</strong> ' + esc(widestRange.name) +
          ' spans ' + widestRange.range.toFixed(1) + ' points — from masterpiece to "meh" within one style.';
      }
    } else if (currentLb === 'regions') {
      var regionMap = {};
      rated.forEach(function(b) {
        if (!b.state) return;
        if (!regionMap[b.state]) regionMap[b.state] = [];
        regionMap[b.state].push(b.rating);
      });
      var regionEntries = Object.entries(regionMap).filter(function(e) { return e[1].length >= 5; });
      if (regionEntries.length) {
        var topRegion = regionEntries.map(function(e) {
          return { name: e[0], avg: avg(e[1]), count: e[1].length };
        }).sort(function(a, b) { return b.avg - a.avg; })[0];
        var pctOfTotal = (regionEntries.find(function(e) { return e[0] === topRegion.name; })[1].length / rated.length * 100).toFixed(0);
        fact = '🗺️ <strong>' + esc(topRegion.name) + '</strong> leads quality with a ' + topRegion.avg.toFixed(2) +
          ' avg — that\'s ' + pctOfTotal + '% of Kevin\'s collection coming from one region.';
      }
    } else if (currentLb === 'hops') {
      var hopMap = {};
      rated.forEach(function(b) {
        if (!b.hops || b.hops === 'None') return;
        b.hops.split(',').forEach(function(h) {
          h = h.trim(); if (!h) return;
          if (!hopMap[h]) hopMap[h] = [];
          hopMap[h].push(b.rating);
        });
      });
      var totalHopVarieties = Object.keys(hopMap).length;
      fact = '🌿 Kevin has encountered <strong>' + totalHopVarieties + ' different hop varieties</strong> — that\'s more hops than most people have opinions.';
    }

    if (fact) {
      var div = document.createElement('div');
      div.id = 'lbDidYouKnow';
      div.style.cssText = 'font-size:.8rem;color:var(--text-2);background:rgba(240,160,48,.06);border:1px solid rgba(240,160,48,.1);border-radius:8px;padding:10px 16px;margin-bottom:16px;line-height:1.45;text-align:center;';
      div.innerHTML = '💡 <em>Did you know?</em> ' + fact;
      dom.leaderboard.parentNode.insertBefore(div, dom.leaderboard);
    }
  }

  function renderLeaderboard() {
    // Special tabs with different rendering
    if (currentLb === 'gems') return renderHiddenGems();
    if (currentLb === 'spots') return renderPurchaseSpots();

    // "Did you know?" callout per leaderboard tab
    renderLeaderboardDidYouKnow();

    var minCounts = { breweries: 3, styles: 3, regions: 5, hops: 2 };
    var minCount = minCounts[currentLb] || 3;
    var rated = filtered.filter(function(b) { return b.rating != null; });
    var map = {};

    rated.forEach(function(b) {
      var key;
      if (currentLb === 'breweries') key = b.brewery || 'Unknown';
      else if (currentLb === 'styles') key = b.style || 'Unknown';
      else if (currentLb === 'regions') key = b.state || 'Unknown';
      else if (currentLb === 'hops') {
        if (!b.hops || b.hops === 'None') return;
        b.hops.split(',').forEach(function(h) {
          h = h.trim();
          if (!h) return;
          if (!map[h]) map[h] = { ratings: [], beers: [] };
          map[h].ratings.push(b.rating);
          map[h].beers.push(b);
        });
        return;
      }
      if (key) {
        if (!map[key]) map[key] = { ratings: [], beers: [] };
        map[key].ratings.push(b.rating);
        map[key].beers.push(b);
      }
    });

    var rows = Object.entries(map)
      .filter(function(e) { return e[1].ratings.length >= minCount; })
      .map(function(e) {
        var k = e[0], v = e[1];
        var sorted = v.ratings.slice().sort(function(a,b){return a-b;});
        return {
          name: k,
          avg: avg(v.ratings),
          count: v.ratings.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          ratings: v.ratings,
          topBeer: v.beers.sort(function(a,b){return (b.rating||0)-(a.rating||0);})[0]
        };
      })
      .sort(function(a, b) { return b.avg - a.avg; });

    if (!rows.length) {
      dom.leaderboard.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📊</span><div class="empty-state-msg">No data for this leaderboard with current filters.<br>Try broadening your search or clearing a&nbsp;filter.</div></div>';
      return;
    }

    var maxAvg = rows[0].avg;
    var minAvg = rows[rows.length - 1].avg;
    var medals = ['🥇', '🥈', '🥉'];

    var html = '<table class="lb-table"><thead><tr>' +
      '<th>#</th><th>Name</th><th>Avg</th><th>Count</th><th>Rating Bar</th><th>Distribution</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function(r, i) {
      // Normalized bar from minAvg..maxAvg
      var range = maxAvg - minAvg;
      var pct = range > 0 ? ((r.avg - minAvg) / range * 70 + 30) : 80;
      var barColor = ratingColor(r.avg);

      // Build mini sparkline of ratings distribution
      var sparkBuckets = new Array(10).fill(0);
      r.ratings.forEach(function(rat) {
        var idx = Math.min(9, Math.max(0, Math.floor((rat - 5) / 0.5)));
        sparkBuckets[idx]++;
      });
      var sparkMax = Math.max.apply(null, sparkBuckets);

      var sparkHtml = '<div class="lb-sparkline">';
      sparkBuckets.forEach(function(c) {
        var h = sparkMax > 0 ? Math.max(2, c / sparkMax * 20) : 2;
        sparkHtml += '<div class="lb-sparkline-bar" style="height:' + h + 'px;background:' + barColor + '"></div>';
      });
      sparkHtml += '</div>';

      var rank = i < 3 ? '<span class="lb-rank-medal">' + medals[i] + '</span>' : (i + 1);

      html += '<tr data-name="' + esc(r.name) + '">' +
        '<td>' + rank + '</td>' +
        '<td>' + esc(r.name) + (r.topBeer ? '<br><span style="font-size:.72rem;color:#7f87a0;font-weight:400">Best: ' + esc(r.topBeer.beer) + '</span>' : '') + '</td>' +
        '<td>' + r.avg.toFixed(2) + '</td>' +
        '<td>' + r.count + '</td>' +
        '<td class="lb-bar-cell"><div class="lb-bar-wrap"><div class="lb-bar" style="width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,' + barColor + '44,' + barColor + ');"><span class="lb-bar-label">' + r.avg.toFixed(2) + '</span></div></div></td>' +
        '<td>' + sparkHtml + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    dom.leaderboard.innerHTML = html;

    // Click-to-filter on leaderboard rows
    dom.leaderboard.querySelectorAll('tbody tr').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var name = this.dataset.name;
        if (currentLb === 'styles') {
          dom.filterStyle.value = name;
          filters.style = name;
        } else if (currentLb === 'regions') {
          dom.filterRegion.value = name;
          filters.region = name;
        } else if (currentLb === 'breweries' || currentLb === 'hops') {
          dom.searchInput.value = name;
          filters.search = name;
        }
        onFilterChange();
        switchView('cards');
      });
    });
  }

  // ── Hidden Gems: High-rated beers from under-the-radar breweries ──
  function renderHiddenGems() {
    var rated = filtered.filter(function(b) { return b.rating != null && b.rating >= 8.5; });
    var brewCounts = {};
    data.forEach(function(b) { brewCounts[b.brewery] = (brewCounts[b.brewery] || 0) + 1; });

    // Gems are high-rated beers from breweries Kevin has tried ≤3 times
    var gems = rated.filter(function(b) { return (brewCounts[b.brewery] || 0) <= 3; })
      .sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); })
      .slice(0, 30);

    if (!gems.length) {
      dom.leaderboard.innerHTML = '<div class="empty-state"><span class="empty-state-icon">💎</span><div class="empty-state-msg">No hidden gems surfaced with those filters.<br>Broaden your search — the diamonds are in there, just buried&nbsp;deeper.</div></div>';
      return;
    }

    var html = '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:12px;text-align:center">High-rated beers (8.5+) from breweries Kevin only tried 1–3 times. One-hit wonders worth&nbsp;revisiting.</p>';
    html += '<table class="lb-table"><thead><tr><th>#</th><th>Beer</th><th>Brewery</th><th>Rating</th><th>Style</th></tr></thead><tbody>';
    var medals = ['🥇', '🥈', '🥉'];
    gems.forEach(function(b, i) {
      var rank = i < 3 ? '<span class="lb-rank-medal">' + medals[i] + '</span>' : (i + 1);
      html += '<tr data-id="' + b.id + '" style="cursor:pointer">' +
        '<td>' + rank + '</td>' +
        '<td style="color:var(--amber-l);font-weight:700">' + esc(b.beer) + '</td>' +
        '<td style="color:var(--cyan)">' + esc(b.brewery) + ' <span style="font-size:.7rem;color:var(--text-3)">(' + (brewCounts[b.brewery] || 0) + ' tried)</span></td>' +
        '<td style="font-weight:700;color:var(--gold)">' + b.rating.toFixed(1) + '</td>' +
        '<td style="font-size:.8rem;color:var(--text-3)">' + esc(b.style) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    dom.leaderboard.innerHTML = html;

    dom.leaderboard.querySelectorAll('tbody tr').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var beer = dataById.get(tr.dataset.id);
        if (beer) openModal(beer);
      });
    });
  }

  // ── Purchase Spots: Where Kevin finds the best beer ──
  function renderPurchaseSpots() {
    var rated = filtered.filter(function(b) { return b.rating != null && b.purchased; });
    var map = {};
    rated.forEach(function(b) {
      var spot = b.purchased.trim();
      if (!spot) return;
      if (!map[spot]) map[spot] = { ratings: [], beers: [], styles: {} };
      map[spot].ratings.push(b.rating);
      map[spot].beers.push(b);
      var fam = Object.keys(STYLE_FAMILY_MAP).find(function(f) { return matchesFamily(b.style, f); }) || 'Other';
      map[spot].styles[fam] = (map[spot].styles[fam] || 0) + 1;
    });

    var rows = Object.entries(map)
      .filter(function(e) { return e[1].ratings.length >= 2; })
      .map(function(e) {
        var eliteCount = e[1].ratings.filter(function(r) { return r >= 8.5; }).length;
        var topStyles = Object.entries(e[1].styles).sort(function(a,b){return b[1]-a[1];}).slice(0, 3);
        return {
          name: e[0],
          avg: avg(e[1].ratings),
          count: e[1].ratings.length,
          hitRate: (eliteCount / e[1].ratings.length * 100),
          eliteCount: eliteCount,
          topStyles: topStyles,
          topBeer: e[1].beers.slice().sort(function(a,b){return (b.rating||0)-(a.rating||0);})[0]
        };
      })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 30);

    if (!rows.length) {
      dom.leaderboard.innerHTML = '<div class="empty-state"><span class="empty-state-icon">\uD83D\uDCCD</span><div class="empty-state-msg">No spots to show with these filters.<br>Kevin buys beer everywhere \u2014 try widening your\u00A0search.</div></div>';
      return;
    }

    var maxCount = rows[0].count;
    var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

    // Sort toggle
    var sortedByQuality = rows.slice().sort(function(a,b) { return b.avg - a.avg; });
    var bestQualitySpot = sortedByQuality[0];
    var bestHitRate = rows.slice().filter(function(r){return r.count >= 5;}).sort(function(a,b){return b.hitRate - a.hitRate;})[0];

    var html = '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:8px;text-align:center">Where Kevin buys his beer \u2014 sorted by volume. Styles show what each spot specializes\u00A0in.</p>';
    if (bestQualitySpot || bestHitRate) {
      html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:12px">';
      if (bestQualitySpot) {
        html += '<div style="font-size:.75rem;padding:5px 10px;background:rgba(74,224,138,.06);border:1px solid rgba(74,224,138,.12);border-radius:6px;color:var(--text-2)">\u2B50 <strong>Highest quality:</strong> ' + esc(bestQualitySpot.name) + ' (' + bestQualitySpot.avg.toFixed(2) + ' avg)</div>';
      }
      if (bestHitRate && bestHitRate.name !== (bestQualitySpot && bestQualitySpot.name)) {
        html += '<div style="font-size:.75rem;padding:5px 10px;background:rgba(240,160,48,.06);border:1px solid rgba(240,160,48,.12);border-radius:6px;color:var(--text-2)">\uD83C\uDFAF <strong>Best hit rate:</strong> ' + esc(bestHitRate.name) + ' (' + bestHitRate.hitRate.toFixed(0) + '% score 8.5+)</div>';
      }
      html += '</div>';
    }
    html += '<table class="lb-table"><thead><tr><th>#</th><th>Spot</th><th>Avg</th><th>Beers</th><th>Hit Rate</th><th>Specialties</th></tr></thead><tbody>';
    rows.forEach(function(r, i) {
      var barColor = ratingColor(r.avg);
      var rank = i < 3 ? '<span class="lb-rank-medal">' + medals[i] + '</span>' : (i + 1);
      var hitColor = r.hitRate >= 60 ? 'var(--green)' : r.hitRate >= 40 ? 'var(--gold)' : 'var(--text-3)';
      var styleChips = r.topStyles.map(function(s) {
        return '<span style="display:inline-block;font-size:.68rem;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,.05);color:var(--text-2);margin:1px 2px">' + esc(s[0]) + '\u00A0' + s[1] + '</span>';
      }).join('');
      html += '<tr data-name="' + esc(r.name) + '">' +
        '<td>' + rank + '</td>' +
        '<td>' + esc(r.name) + (r.topBeer ? '<br><span style="font-size:.72rem;color:#7f87a0;font-weight:400">Best: ' + esc(r.topBeer.beer) + '</span>' : '') + '</td>' +
        '<td style="font-weight:700;color:var(--gold)">' + r.avg.toFixed(2) + '</td>' +
        '<td>' + r.count + '</td>' +
        '<td style="font-weight:600;color:' + hitColor + '">' + r.hitRate.toFixed(0) + '% <span style="font-size:.68rem;font-weight:400;color:var(--text-3)">(' + r.eliteCount + '/' + r.count + ')</span></td>' +
        '<td>' + styleChips + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    dom.leaderboard.innerHTML = html;

    // Click to search by spot name
    dom.leaderboard.querySelectorAll('tbody tr').forEach(function(tr) {
      tr.addEventListener('click', function() {
        dom.searchInput.value = this.dataset.name;
        filters.search = this.dataset.name;
        onFilterChange();
        switchView('cards');
      });
    });
  }


    // ══════════════════════════════════════════════════════════
  //  6. ACHIEVEMENTS VIEW
  // ══════════════════════════════════════════════════════════

  function computeAchievements() {
    const allBeers = filtered;
    const total = allBeers.length;
    const brewerySet = new Set();
    const styleSet = new Set();
    const regionSet = new Set();
    const hopSet = new Set();
    let outstanding = 0, ninePlus = 0, ipas = 0, darks = 0, sours = 0;
    let coffeeBeers = 0, heavyHitters = 0, barrelAged = 0;

    allBeers.forEach(function(b) {
      if (b.brewery) brewerySet.add(b.brewery);
      if (b.style) styleSet.add(b.style);
      if (b.state) regionSet.add(b.state);
      if (b.hops && b.hops !== 'None') {
        b.hops.split(',').forEach(function(h) { h = h.trim(); if (h) hopSet.add(h); });
      }
      if (b.simpleRating === 'Outstanding') outstanding++;
      if (b.rating != null && b.rating >= 9) ninePlus++;
      var sl = (b.style || '').toLowerCase();
      if (sl.includes('ipa')) ipas++;
      if (sl.includes('stout') || sl.includes('porter')) darks++;
      if (sl.includes('sour') || sl.includes('gose')) sours++;
      var haystack = [b.beer, b.tastingNotes, b.adjuncts].map(function(s) { return (s || '').toLowerCase(); }).join(' ');
      if (haystack.includes('coffee')) coffeeBeers++;
      if (b._abv >= 10) heavyHitters++;
      var barrelHay = haystack + ' ' + (b.style || '').toLowerCase();
      if (barrelHay.includes('barrel')) barrelAged++;
    });

    return [
      { icon: '🍺', name: 'Century Club', desc: "100 beers deep — that's just the warm-up lap", current: total, threshold: 100 },
      { icon: '🏭', name: 'Brewery Explorer', desc: '50+ breweries on the radar — monogamy is for wine drinkers', current: brewerySet.size, threshold: 50 },
      { icon: '🎨', name: 'Style Sampler', desc: "30+ styles tried — if it ferments, Kevin's drinking it", current: styleSet.size, threshold: 30 },
      { icon: '🌍', name: 'World Traveler', desc: 'Beers from 15+ regions — this palate carries a passport', current: regionSet.size, threshold: 15 },
      { icon: '🏆', name: 'Gold Standard', desc: '50+ Outstanding beers discovered — the hall of fame is getting crowded', current: outstanding, threshold: 50 },
      { icon: '⭐', name: 'Nine Club', desc: '100+ beers at 9 or higher — the Kevin Seal of Approval', current: ninePlus, threshold: 100 },
      { icon: '🌿', name: 'Hop Head', desc: '20+ hop varieties — can identify Citra blindfolded at this point', current: hopSet.size, threshold: 20 },
      { icon: '🍺', name: 'IPA Fanatic', desc: '100+ IPAs rated — Kevin\'s veins run with lupulin', current: ipas, threshold: 100 },
      { icon: '🖤', name: 'Dark Side', desc: '50+ stouts & porters — fully committed to the dark arts', current: darks, threshold: 50 },
      { icon: '🍋', name: 'Sour Power', desc: "20+ sours — Kevin's resting face is now permanently puckered", current: sours, threshold: 20 },
      { icon: '☕', name: 'Coffee Connoisseur', desc: "20+ coffee beers — where caffeine addiction meets hops addiction", current: coffeeBeers, threshold: 20 },
      { icon: '💪', name: 'Heavy Hitter', desc: "20+ beers above 10% ABV — these aren't drinks, they're experiences", current: heavyHitters, threshold: 20 },
      { icon: '🪵', name: 'Barrel Hunter', desc: '20+ barrel-aged finds — good things come to those who wait (in a bourbon barrel)', current: barrelAged, threshold: 20 },
      { icon: '🎲', name: 'Thousand Club', desc: '1,000 beers rated — this stopped being a hobby around beer #500', current: total, threshold: 1000 },
      { icon: '👑', name: 'Five Thousand', desc: '5,000 beers rated — Kevin IS the database now', current: total, threshold: 5000 }
    ];
  }

  function renderAchievements() {
    const achs = computeAchievements();
    dom.achievementsGrid.innerHTML = achs.map(a => {
      const unlocked = a.current >= a.threshold;
      return '<div class="achievement-card ' + (unlocked ? 'unlocked' : 'locked') + '">' +
        '<div class="ach-icon">' + a.icon + '</div>' +
        '<div class="ach-info">' +
          '<h4>' + esc(a.name) + '</h4>' +
          '<p>' + esc(a.desc) + '</p>' +
          '<span class="ach-progress">' + a.current.toLocaleString() + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ══════════════════════════════════════════════════════════
  //  7. HERO STATS (animated count-up)
  // ══════════════════════════════════════════════════════════

  function animateCount(el, target) {
    const dur = 1200;
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = Math.round(ease * target).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initHeroStats() {
    const total = data.length;
    const breweries = new Set(data.map(b => b.brewery).filter(Boolean)).size;
    const styles = new Set(data.map(b => b.style).filter(Boolean)).size;
    const regions = new Set(data.map(b => b.state).filter(Boolean)).size;
    animateCount(dom.heroBeers, total);
    animateCount(dom.heroBreweries, breweries);
    animateCount(dom.heroStyles, styles);
    animateCount(dom.heroRegions, regions);
    dom.footerCount.textContent = total.toLocaleString();
  }

  // ══════════════════════════════════════════════════════════
  //  8. VIEW SWITCHING
  // ══════════════════════════════════════════════════════════

  function switchView(view) {
    currentView = view;
    $$('.view-tab').forEach(t => {
      var isActive = t.dataset.view === view;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    $$('.view-panel').forEach(p => p.classList.toggle('active', p.id === view + '-view'));
    // Show filter context banner on non-cards views
    if (view !== 'cards') {
      var viewEl = document.getElementById(view + '-view');
      if (viewEl) {
        var cont = viewEl.querySelector('.container');
        if (cont) renderFilterBanner(cont);
      }
    }
    if (view === 'insights') renderInsights();
    if (view === 'leaderboard') renderLeaderboard();
    if (view === 'achievements') renderAchievements();
    if (view === 'play') renderPlayView();
    saveStateToHash();
  }

  function switchLbTab(tab) {
    currentLb = tab;
    $$('.lb-tab').forEach(t => t.classList.toggle('active', t.dataset.lb === tab));
    renderLeaderboard();
    saveStateToHash();
  }

  // ══════════════════════════════════════════════════════════
  //  9. EVENT BINDING
  // ══════════════════════════════════════════════════════════

  function bindEvents() {
    // Search (debounced)
    dom.searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        filters.search = dom.searchInput.value.trim();
        $$('.preset').forEach(p => p.classList.remove('active'));
        onFilterChange();
      }, 300);
    });

    // Helper: flush any pending debounced search before applying filter
    function flushSearch() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        filters.search = dom.searchInput.value.trim();
      }
    }

    // Dropdown filters (instant) — deactivate presets on manual change
    dom.filterStyle.addEventListener('change', function () {
      flushSearch();
      filters.style = this.value;
      $$('.preset').forEach(p => p.classList.remove('active'));
      onFilterChange();
    });
    dom.filterRegion.addEventListener('change', function () {
      flushSearch();
      filters.region = this.value;
      $$('.preset').forEach(p => p.classList.remove('active'));
      onFilterChange();
    });
    dom.filterRating.addEventListener('change', function () {
      flushSearch();
      filters.rating = this.value;
      $$('.preset').forEach(p => p.classList.remove('active'));
      onFilterChange();
    });
    dom.filterAbv.addEventListener('change', function () {
      flushSearch();
      filters.abv = this.value;
      $$('.preset').forEach(p => p.classList.remove('active'));
      onFilterChange();
    });
    dom.filterSort.addEventListener('change', function () {
      flushSearch();
      filters.sort = this.value;
      onFilterChange();
    });

    // Clear
    dom.clearFilters.addEventListener('click', function () {
      clearAllFilters();
      $$('.preset').forEach(p => p.classList.remove('active'));
      onFilterChange();
    });

    // Pills
    dom.activePills.addEventListener('click', function (e) {
      const pill = e.target.closest('.pill');
      if (pill) removePill(pill.dataset.pill);
    });

    // Presets
    document.getElementById('presets').addEventListener('click', function (e) {
      const btn = e.target.closest('.preset');
      if (btn) handlePreset(btn);
    });

    // View tabs
    $$('.view-tab').forEach(t => {
      t.addEventListener('click', function () { switchView(this.dataset.view); });
    });

    // Leaderboard tabs
    $$('.lb-tab').forEach(t => {
      t.addEventListener('click', function () { switchLbTab(this.dataset.lb); });
    });

    // Card clicks → modal
    dom.beerGrid.addEventListener('click', function (e) {
      const card = e.target.closest('.beer-card');
      if (card) {
        const beer = dataById.get(card.dataset.id);
        if (beer) openModal(beer);
      }
    });
    // Keyboard support for beer cards (Enter/Space)
    dom.beerGrid.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.beer-card');
        if (card) {
          e.preventDefault();
          const beer = dataById.get(card.dataset.id);
          if (beer) openModal(beer);
        }
      }
    });

    // Similar beer chips inside modal
    dom.modalContent.addEventListener('click', function (e) {
      const chip = e.target.closest('.similar-chip');
      if (chip) {
        const beer = dataById.get(chip.dataset.id);
        if (beer) openModal(beer);
      }
    });

    // Modal close
    dom.modalClose.addEventListener('click', closeModal);
    dom.modal.addEventListener('click', function (e) {
      if (e.target === dom.modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    // Pagination
    dom.pagination.addEventListener('click', function (e) {
      const btn = e.target.closest('.page-btn');
      if (!btn || btn.disabled) return;
      const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
      if (btn.dataset.page === 'prev' && currentPage > 1) currentPage--;
      if (btn.dataset.page === 'next' && currentPage < totalPages) currentPage++;
      renderCards();
      document.getElementById('cards-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Feature 8: Random beer button
    var randomBtn = document.getElementById('randomBeer');
    if (randomBtn) {
      randomBtn.addEventListener('click', function () {
        var pool = filtered.length ? filtered : data;
        var beer = pool[Math.floor(Math.random() * pool.length)];
        if (beer) openModal(beer);
      });
    }

    // Feature NEW: Beer of the Day button
    var botdBtn = document.getElementById('beerOfTheDay');
    if (botdBtn) {
      botdBtn.addEventListener('click', function () {
        var beer = getBeerOfTheDay();
        if (beer) openModal(beer);
      });
    }

    // Feature NEW: Tasting Flight Generator
    var flightBtn = document.getElementById('generateFlight');
    if (flightBtn) {
      flightBtn.addEventListener('click', function () { generateTastingFlight(); });
    }

    // Feature 1: Fun fact ticker — click to cycle
    var ticker = document.getElementById('funFactTicker');
    if (ticker) {
      ticker.addEventListener('click', function () { rotateFunFact(); });
    }

    // Feature 3: Quiz
    var startQuizBtn = document.getElementById('startQuiz');
    if (startQuizBtn) {
      startQuizBtn.addEventListener('click', function () { startNewQuiz(); });
    }

    // Feature 4: Style Showdown
    var showdownBtn = document.getElementById('startShowdown');
    if (showdownBtn) {
      showdownBtn.addEventListener('click', function () { runShowdown(); });
    }

    // Feature 5: Scavenger Hunt
    var huntBtn = document.getElementById('newHunt');
    if (huntBtn) {
      huntBtn.addEventListener('click', function () { generateHunt(); });
    }

    // Feature 6: Welcome modal close
    var welcomeClose = document.getElementById('welcomeClose');
    if (welcomeClose) {
      welcomeClose.addEventListener('click', function () {
        document.getElementById('welcomeModal').style.display = 'none';
        document.body.classList.remove('modal-open');
        try { localStorage.setItem('kevmo-welcomed', '1'); } catch (e) {}
      });
    }
    var welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
      welcomeModal.addEventListener('click', function (e) {
        if (e.target === welcomeModal) {
          welcomeModal.style.display = 'none';
          document.body.classList.remove('modal-open');
          try { localStorage.setItem('kevmo-welcomed', '1'); } catch (e) {}
        }
      });
    }

    // Feature 10: Shareable cards — click to copy
    var shareRow = document.getElementById('shareCardsRow');
    if (shareRow) {
      shareRow.addEventListener('click', function (e) {
        var card = e.target.closest('.share-stat-card');
        if (!card) return;
        var text = card.getAttribute('data-share');
        if (text && navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            card.classList.add('copied');
            setTimeout(function () { card.classList.remove('copied'); }, 1500);
          }).catch(function() {});
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  10. SOCIAL & DISCOVERY FEATURES
  // ══════════════════════════════════════════════════════════

  // ── Feature 1: Fun Fact Ticker ──────────────────────────
  var funFacts = [];
  var currentFactIdx = 0;

  function buildFunFacts() {
    var rated = data.filter(function (b) { return b.rating != null; });
    var brewCounts = {}, styleCounts = {}, stateCounts = {};
    var coffeeCount = 0, perfectCount = 0, maxAbv = 0, maxAbvBeer = '';
    var total10Plus = 0, totalSours = 0, totalIPAs = 0, totalStouts = 0;

    data.forEach(function (b) {
      brewCounts[b.brewery] = (brewCounts[b.brewery] || 0) + 1;
      styleCounts[b.style] = (styleCounts[b.style] || 0) + 1;
      stateCounts[b.state] = (stateCounts[b.state] || 0) + 1;
      var haystack = [b.beer, b.tastingNotes, b.adjuncts].map(function (s) { return (s || '').toLowerCase(); }).join(' ');
      if (haystack.includes('coffee')) coffeeCount++;
      if (b.rating === 10) perfectCount++;
      var abv = b._abv;
      if (abv > maxAbv) { maxAbv = abv; maxAbvBeer = b.beer; }
      if (abv >= 10) total10Plus++;
      var sl = (b.style || '').toLowerCase();
      if (sl.includes('sour') || sl.includes('gose') || sl.includes('lambic') || sl.includes('wild')) totalSours++;
      if (sl.includes('ipa')) totalIPAs++;
      if (sl.includes('stout')) totalStouts++;
    });

    var topBrew = Object.entries(brewCounts).sort(function (a, b) { return b[1] - a[1]; });
    var topStyle = Object.entries(styleCounts).sort(function (a, b) { return b[1] - a[1]; });
    var topState = Object.entries(stateCounts).sort(function (a, b) { return b[1] - a[1]; });
    var avgRating = avg(rated.map(function (b) { return b.rating; }));
    var outstanding = data.filter(function (b) { return b.simpleRating === 'Outstanding'; });

    funFacts = [
      'Kevin has conquered ' + coffeeCount + ' coffee beers — his bloodstream is basically cold brew with hops.',
      'Ride or die: ' + topBrew[0][0] + ' leads with ' + topBrew[0][1] + ' beers. That\'s not loyalty, it\'s a relationship.',
      'The hardest hitter? ' + maxAbvBeer + ' at ' + maxAbv + '% ABV. One sip and your plans change. 🤯',
      'Kevin\'s lifetime average: ' + avgRating.toFixed(1) + '/10 — generous but not a pushover.',
      topState[0][0] + ' runs the show with ' + topState[0][1] + ' beers — that\'s ' + Math.round(topState[0][1] / data.length * 100) + '% of the whole collection.',
      'Only ' + outstanding.length + ' beers earned "Outstanding" — that\'s just ' + (outstanding.length / data.length * 100).toFixed(1) + '%. Kevin doesn\'t hand out trophies.',
      totalIPAs + ' IPAs and counting. At this point Kevin\'s tongue has a permanent hop tattoo.',
      totalStouts + ' stouts in the books. Kevin has stared into the dark abyss — and drank it. 🖤',
      totalSours + ' sours explored — Kevin\'s face has been stuck in pucker mode since beer #200.',
      total10Plus + ' beers north of 10% ABV. Kevin doesn\'t sip danger — he pours a full glass.',
      topBrew.length + ' different breweries in the collection. Kevin has more brewery contacts than some people have phone&nbsp;contacts.',
      Object.keys(styleCounts).length + ' unique styles tasted — Kevin\'s palate has more range than a concert pianist.',
      perfectCount > 0 ? 'Only ' + perfectCount + ' beers earned a mythical perfect 10. If you find one, savor the moment.' : 'Zero perfect 10s. Kevin is the Simon Cowell of beer.',
      'At one beer per day, Kevin\'s collection spans ' + Math.round(data.length / 365) + '+ years of drinking. This man is committed.',
    ];

    // Shuffle
    for (var i = funFacts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = funFacts[i]; funFacts[i] = funFacts[j]; funFacts[j] = tmp;
    }
  }

  function rotateFunFact() {
    if (!funFacts.length) return;
    currentFactIdx = (currentFactIdx + 1) % funFacts.length;
    var el = document.getElementById('funFactText');
    if (el) {
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.textContent = funFacts[currentFactIdx];
      el.style.animation = 'factFade .5s ease';
    }
  }

  function initFunFacts() {
    buildFunFacts();
    var el = document.getElementById('funFactText');
    if (el && funFacts.length) {
      el.textContent = funFacts[0];
    }
    setInterval(rotateFunFact, 6000);
  }

  // ── Feature 2: Superlative Awards ──────────────────────
  function renderAwards() {
    var scroll = document.getElementById('awardsScroll');
    if (!scroll) return;

    var brewCounts = {}, brewRatings = {}, styleCounts = {}, stateCounts = {};
    var coffeeCount = 0, maxAbv = 0, maxAbvBeer = '', minAbv = 100, minAbvBeer = '';
    var totalBarrel = 0, totalSour = 0;
    var highestRated = null, lowestRated = null;

    data.forEach(function (b) {
      brewCounts[b.brewery] = (brewCounts[b.brewery] || 0) + 1;
      if (!brewRatings[b.brewery]) brewRatings[b.brewery] = [];
      if (b.rating != null) brewRatings[b.brewery].push(b.rating);
      styleCounts[b.style] = (styleCounts[b.style] || 0) + 1;
      stateCounts[b.state] = (stateCounts[b.state] || 0) + 1;
      var haystack = [b.beer, b.tastingNotes, b.adjuncts].map(function (s) { return (s || '').toLowerCase(); }).join(' ');
      if (haystack.includes('coffee')) coffeeCount++;
      if (haystack.includes('barrel')) totalBarrel++;
      var sl = (b.style || '').toLowerCase();
      if (sl.includes('sour') || sl.includes('gose') || sl.includes('wild') || sl.includes('lambic')) totalSour++;
      var abv = b._abv;
      if (abv > maxAbv) { maxAbv = abv; maxAbvBeer = b.beer; }
      if (abv > 0 && abv < minAbv) { minAbv = abv; minAbvBeer = b.beer; }
      if (b.rating != null) {
        if (!highestRated || b.rating > highestRated.rating) highestRated = b;
        if (!lowestRated || b.rating < lowestRated.rating) lowestRated = b;
      }
    });

    var topBrew = Object.entries(brewCounts).sort(function (a, b) { return b[1] - a[1]; })[0];
    var bestBrew = Object.entries(brewRatings)
      .filter(function (e) { return e[1].length >= 5; })
      .map(function (e) { return { name: e[0], avg: avg(e[1]), count: e[1].length }; })
      .sort(function (a, b) { return b.avg - a.avg; })[0];

    var awards = [
      { emoji: '🏆', title: 'Most Loyal', value: topBrew[0], detail: topBrew[1] + ' beers tried' },
      { emoji: '⭐', title: 'Best Brewery', value: bestBrew ? bestBrew.name : '—', detail: bestBrew ? bestBrew.avg.toFixed(1) + ' avg (' + bestBrew.count + ' beers)' : '' },
      { emoji: '💪', title: 'Strongest Beer', value: maxAbvBeer, detail: maxAbv + '% ABV' },
      { emoji: '🪶', title: 'Lightest Beer', value: minAbvBeer, detail: minAbv + '% ABV' },
      { emoji: '👑', title: 'The Crown Jewel', value: highestRated ? highestRated.beer : '—', detail: highestRated ? 'Rated ' + highestRated.rating + '/10' : '' },
      { emoji: '☕', title: 'Coffee Fanatic', value: coffeeCount + ' coffee beers', detail: 'And probably still tired' },
      { emoji: '🪵', title: 'Barrel Baron', value: totalBarrel + ' barrel-aged', detail: 'Patience is a virtue' },
      { emoji: '🍋', title: 'Sour Commander', value: totalSour + ' sours', detail: 'Pucker up' },
      { emoji: '🌍', title: 'Globe Trotter', value: Object.keys(stateCounts).length + ' regions', detail: 'Beer knows no borders' },
      { emoji: '🎨', title: 'Style Chameleon', value: Object.keys(styleCounts).length + ' styles', detail: 'Try everything once (or twice)' },
    ];

    scroll.innerHTML = awards.map(function (a) {
      return '<div class="award-card">' +
        '<span class="award-emoji">' + a.emoji + '</span>' +
        '<div class="award-title">' + esc(a.title) + '</div>' +
        '<div class="award-value">' + esc(a.value) + '</div>' +
        '<div class="award-detail">' + esc(a.detail) + '</div>' +
      '</div>';
    }).join('');
  }

  // ── Feature NEW: Beer of the Day (deterministic by date) ──
  function getBeerOfTheDay() {
    var rated = data.filter(function (b) { return b.rating != null && b.rating >= 8; });
    if (!rated.length) return null;
    var today = new Date();
    var seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    // Simple deterministic hash
    var hash = seed;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b | 0;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b | 0;
    hash = (hash >> 16) ^ hash;
    var idx = Math.abs(hash) % rated.length;
    return rated[idx];
  }

  // ── Feature NEW: Tasting Flight Generator ─────────────
  function generateTastingFlight() {
    var themeEl = document.getElementById('flightTheme');
    var sizeEl = document.getElementById('flightSize');
    var resultEl = document.getElementById('flightResult');
    if (!themeEl || !sizeEl || !resultEl) return;

    var theme = themeEl.value;
    var size = parseInt(sizeEl.value, 10) || 6;
    var rated = data.filter(function (b) { return b.rating != null && b.beer && b.brewery; });
    var pool = [];

    switch (theme) {
      case 'ipa':
        pool = rated.filter(function (b) { return matchesFamily(b.style, 'IPA') && b.rating >= 8; });
        break;
      case 'dark':
        pool = rated.filter(function (b) {
          return (matchesFamily(b.style, 'Stout') || matchesFamily(b.style, 'Porter')) && b.rating >= 8;
        });
        break;
      case 'sour':
        pool = rated.filter(function (b) { return matchesFamily(b.style, 'Sour') && b.rating >= 7.5; });
        break;
      case 'strong':
        pool = rated.filter(function (b) { return b._abv >= 10 && b.rating >= 8; });
        break;
      case 'crowd-pleaser':
        pool = rated.filter(function (b) { return b.rating >= 8.5; });
        break;
      case 'hidden-gems': {
        var brewCounts = {};
        data.forEach(function (b) { brewCounts[b.brewery] = (brewCounts[b.brewery] || 0) + 1; });
        pool = rated.filter(function (b) { return b.rating >= 8.5 && (brewCounts[b.brewery] || 0) <= 3; });
        break;
      }
      case 'controversial': {
        // Beers Kevin rated way differently than their style average
        var styleAvgs = {};
        rated.forEach(function (b) {
          if (!styleAvgs[b.style]) styleAvgs[b.style] = { sum: 0, count: 0 };
          styleAvgs[b.style].sum += b.rating;
          styleAvgs[b.style].count++;
        });
        pool = rated.filter(function (b) {
          var sa = styleAvgs[b.style];
          if (!sa || sa.count < 5) return false;
          var styleAvg = sa.sum / sa.count;
          return Math.abs(b.rating - styleAvg) >= 1.0;
        });
        break;
      }
      default: // diverse
        pool = rated.filter(function (b) { return b.rating >= 7.5; });
        break;
    }

    if (pool.length < size) {
      resultEl.innerHTML = '<p style="color:var(--text-3);font-size:.84rem;text-align:center;padding:12px">Not enough beers match this theme — try a different one or reduce the flight size.</p>';
      return;
    }

    // Pick diverse beers: different breweries, and for "diverse" theme, different styles
    var picked = [];
    var usedBreweries = new Set();
    var usedStyles = new Set();

    // Shuffle pool
    var shuffled = pool.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }

    // First pass: maximize diversity
    for (var k = 0; k < shuffled.length && picked.length < size; k++) {
      var b = shuffled[k];
      if (usedBreweries.has(b.brewery)) continue;
      if (theme === 'diverse' && usedStyles.has(b.style)) continue;
      picked.push(b);
      usedBreweries.add(b.brewery);
      usedStyles.add(b.style);
    }
    // Second pass: fill remaining slots (relax style constraint)
    if (picked.length < size) {
      for (var m = 0; m < shuffled.length && picked.length < size; m++) {
        var b2 = shuffled[m];
        if (picked.indexOf(b2) !== -1) continue;
        if (usedBreweries.has(b2.brewery)) continue;
        picked.push(b2);
        usedBreweries.add(b2.brewery);
      }
    }

    // Sort the flight from lightest to strongest ABV for proper tasting order
    picked.sort(function (a, b) { return a._abv - b._abv; });

    var themeNames = {
      diverse: '🌈 Diverse Flight', ipa: '🍺 IPA Exploration', dark: '🖤 Dark & Roasty',
      sour: '🍋 Sour Adventure', strong: '💪 Heavy Hitters',
      'crowd-pleaser': '🎉 Crowd Pleasers', 'hidden-gems': '💎 Hidden Gems',
      controversial: '🤔 Kevin\'s Hot Takes'
    };
    var themeTips = {
      diverse: 'Sorted light → strong. Start with the lower ABV and work your way up!',
      ipa: 'Start with the lightest IPA and build up. Cleanse your palate with crackers between sips.',
      dark: 'Pour small — these are for savoring. Pair with dark chocolate or sharp cheese.',
      sour: 'The acidity wakes up your palate. Great as openers or paired with charcuterie.',
      strong: '⚠️ These are big. Small pours, sip slowly, and have snacks ready.',
      'crowd-pleaser': 'These are Kevin-approved bangers. Great for people who "don\'t like beer."',
      'hidden-gems': 'Obscure picks that scored high. Perfect for a "name that brewery" blind tasting.',
      controversial: 'Kevin\'s ratings diverge from the style average here. Debate fuel! 🔥'
    };

    var html = '<div class="flight-result">';
    html += '<h4 style="color:var(--amber-l);margin-bottom:4px">' + (themeNames[theme] || 'Your Flight') + '</h4>';
    html += '<p style="font-size:.76rem;color:var(--text-3);margin-bottom:14px">💡 ' + esc(themeTips[theme] || '') + '</p>';
    html += '<div class="flight-beers">';
    picked.forEach(function (b, idx) {
      html += '<div class="flight-beer-card" data-id="' + b.id + '" style="cursor:pointer">' +
        '<div class="flight-num">' + (idx + 1) + '</div>' +
        '<div class="flight-info">' +
          '<div style="font-weight:700;color:var(--amber-l)">' + esc(b.beer) + '</div>' +
          '<div style="font-size:.78rem;color:var(--cyan)">' + esc(b.brewery) + '</div>' +
          '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">' +
            esc(b.style) + ' · ' + esc(b.abv || '?%') + ' · ' +
            '<span class="' + ratingClass(b.simpleRating) + '" style="font-weight:700">' + b.rating.toFixed(1) + '</span>' +
          '</div>' +
          (b.tastingNotes ? '<div style="font-size:.7rem;color:var(--text-3);margin-top:3px;font-style:italic">"' + esc(b.tastingNotes.substring(0, 80)) + (b.tastingNotes.length > 80 ? '…' : '') + '"</div>' : '') +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    html += '<button class="play-btn-secondary" id="rerollFlight" style="margin-top:10px;font-size:.78rem">🎲 Reroll — Different Picks</button>';
    html += '</div>';
    resultEl.innerHTML = html;

    // Wire up click-to-open on flight cards
    resultEl.querySelectorAll('.flight-beer-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var beer = dataById.get(card.dataset.id);
        if (beer) openModal(beer);
      });
    });
    // Wire up reroll button
    var reroll = document.getElementById('rerollFlight');
    if (reroll) {
      reroll.addEventListener('click', function () { generateTastingFlight(); });
    }
  }

  // ── Feature 3: Rating Quiz (Enhanced) ──────────────────
  var quizState = { score: 0, total: 0, current: null, streak: 0, bestStreak: 0 };

  function startNewQuiz() {
    var rated = data.filter(function (b) { return b.rating != null && b.beer && b.brewery; });
    var beer = rated[Math.floor(Math.random() * rated.length)];
    quizState.current = beer;

    var container = document.getElementById('quizContent');
    if (!container) return;

    // Smarter options: cluster around actual rating so it's challenging but fair
    var actual = beer.rating;
    var options = [];
    options.push(actual);
    var offsets = [-1.5, -1.0, -0.5, 0.5, 1.0, 1.5];
    offsets.forEach(function (off) {
      var val = Math.round((actual + off) * 2) / 2;
      if (val >= 5 && val <= 10 && options.indexOf(val) === -1) options.push(val);
    });
    for (var r = 5; r <= 10 && options.length < 6; r += 0.5) {
      if (options.indexOf(r) === -1) options.push(r);
    }
    options.sort(function (a, b) { return a - b; });

    // Pre-compute style average for post-guess context
    var sameStyle = rated.filter(function (b2) { return b2.style === beer.style; });
    var styleAvg = sameStyle.length >= 3 ? avg(sameStyle.map(function (b2) { return b2.rating; })) : 0;
    quizState._styleAvg = styleAvg;
    quizState._sameStyleCount = sameStyle.length;

    container.innerHTML =
      '<div class="quiz-beer-info">' +
        '<div class="quiz-beer-name">' + esc(beer.beer) + '</div>' +
        '<div class="quiz-beer-brewery">' + esc(beer.brewery) + '</div>' +
        '<div class="quiz-beer-meta">' +
          (beer.style ? '<span class="tag tag-style">' + esc(beer.style) + '</span>' : '') +
          (beer.abv ? '<span class="tag tag-abv">' + esc(beer.abv) + '</span>' : '') +
          (beer.state ? '<span class="tag tag-region">' + esc(beer.state) + '</span>' : '') +
        '</div>' +
        (beer.tastingNotes ? '<p class="quiz-beer-notes">"' + esc(beer.tastingNotes) + '"</p>' : '') +
      '</div>' +
      '<div class="quiz-options">' +
        options.map(function (r) {
          return '<button class="quiz-option" data-rating="' + r + '">' + r.toFixed(1) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="quiz-score">Score: ' + quizState.score + ' / ' + quizState.total +
        (quizState.streak > 0 ? ' · 🔥 ' + quizState.streak + ' streak' : '') +
      '</div>';

    container.querySelectorAll('.quiz-option').forEach(function (btn) {
      btn.addEventListener('click', function () { handleQuizGuess(parseFloat(btn.dataset.rating)); });
    });
  }

  function handleQuizGuess(guess) {
    var beer = quizState.current;
    if (!beer) return;
    var actual = beer.rating;
    var diff = Math.abs(guess - actual);
    quizState.total++;
    var hit = diff <= 0.5;
    if (hit) {
      quizState.score++;
      quizState.streak++;
      if (quizState.streak > quizState.bestStreak) quizState.bestStreak = quizState.streak;
    } else {
      quizState.streak = 0;
    }

    var container = document.getElementById('quizContent');
    var options = container.querySelectorAll('.quiz-option');
    options.forEach(function (btn) {
      btn.classList.add('locked');
      var r = parseFloat(btn.dataset.rating);
      if (r === guess && !hit) btn.classList.add('wrong');
      if (r === guess && hit) btn.classList.add('correct');
      if (Math.abs(r - actual) < 0.01) btn.classList.add('actual');
    });

    // Rich result with context
    var resultDiv = document.createElement('div');
    resultDiv.className = 'quiz-result ' + (hit ? 'hit' : 'miss');

    var resultMsg = '';
    if (hit && diff < 0.01) {
      resultMsg = '🎯 PERFECT! Kevin rated this exactly ' + actual.toFixed(1) + '!';
    } else if (hit) {
      resultMsg = '🎯 Close enough! Kevin rated this ' + actual.toFixed(1) + '.';
    } else if (diff <= 1.0) {
      resultMsg = '😬 So close! Kevin rated this ' + actual.toFixed(1) + ' — you guessed ' + guess.toFixed(1) + '.';
    } else {
      resultMsg = '❌ Way off! Kevin rated this ' + actual.toFixed(1) + ' — you guessed ' + guess.toFixed(1) + '.';
    }

    // Style comparison insight
    var styleContext = '';
    if (quizState._sameStyleCount >= 3 && quizState._styleAvg > 0) {
      var styleDiff = actual - quizState._styleAvg;
      if (styleDiff > 0.5) {
        styleContext = '📈 <strong>' + styleDiff.toFixed(1) + ' above</strong> Kevin\'s ' + esc(beer.style) + ' avg (' + quizState._styleAvg.toFixed(1) + ')';
      } else if (styleDiff < -0.5) {
        styleContext = '📉 <strong>' + Math.abs(styleDiff).toFixed(1) + ' below</strong> Kevin\'s ' + esc(beer.style) + ' avg (' + quizState._styleAvg.toFixed(1) + ')';
      } else {
        styleContext = '📊 Right at Kevin\'s ' + esc(beer.style) + ' avg (' + quizState._styleAvg.toFixed(1) + ')';
      }
    }

    resultDiv.innerHTML = '<div>' + resultMsg + '</div>' +
      '<div style="font-size:.76rem;color:var(--text-3);margin-top:6px;line-height:1.4">' +
        (beer.style ? '<span style="margin-right:10px">🎨 ' + esc(beer.style) + '</span>' : '') +
        (beer.brewery ? '<span style="margin-right:10px">🏭 ' + esc(beer.brewery) + '</span>' : '') +
        (beer.state ? '<span style="margin-right:10px">📍 ' + esc(beer.state) + '</span>' : '') +
        (beer.abv ? '<span>🍺 ' + esc(beer.abv) + '</span>' : '') +
      '</div>' +
      (styleContext ? '<div style="font-size:.74rem;margin-top:5px;color:var(--text-2)">' + styleContext + '</div>' : '') +
      (quizState.streak >= 3 ? '<div style="font-size:.78rem;margin-top:4px;color:var(--gold)">🔥 ' + quizState.streak + ' in a row!</div>' : '');

    container.insertBefore(resultDiv, container.querySelector('.quiz-score'));

    var streakText = quizState.streak > 0 ? ' · 🔥 ' + quizState.streak + ' streak' : '';
    if (quizState.bestStreak > quizState.streak) streakText += ' (best: ' + quizState.bestStreak + ')';
    container.querySelector('.quiz-score').textContent = 'Score: ' + quizState.score + ' / ' + quizState.total +
      ' (' + (quizState.total > 0 ? Math.round(quizState.score / quizState.total * 100) : 0) + '%)' + streakText;

    var nextBtn = document.createElement('button');
    nextBtn.className = 'play-btn';
    nextBtn.textContent = 'Next Beer →';
    nextBtn.style.alignSelf = 'center';
    nextBtn.style.marginTop = '4px';
    nextBtn.addEventListener('click', function () { startNewQuiz(); });
    container.appendChild(nextBtn);
  }

  // ── Feature 4: Style Showdown ──────────────────────────
  function populateShowdownDropdowns() {
    var families = Object.keys(STYLE_FAMILY_MAP).filter(function (fam) {
      return data.some(function (b) { return matchesFamily(b.style, fam); });
    });
    var selA = document.getElementById('showdownA');
    var selB = document.getElementById('showdownB');
    if (!selA || !selB) return;
    families.forEach(function (fam) {
      var count = data.filter(function (b) { return matchesFamily(b.style, fam); }).length;
      var optA = document.createElement('option');
      optA.value = fam; optA.textContent = fam + ' (' + count + ')';
      selA.appendChild(optA);
      var optB = document.createElement('option');
      optB.value = fam; optB.textContent = fam + ' (' + count + ')';
      selB.appendChild(optB);
    });
  }

  function runShowdown() {
    var famA = document.getElementById('showdownA').value;
    var famB = document.getElementById('showdownB').value;
    var result = document.getElementById('showdownResult');
    if (!famA || !famB || famA === famB) {
      result.innerHTML = '<p style="color:var(--text-3);font-size:.84rem;">Pick two different styles!</p>';
      return;
    }

    var beersA = data.filter(function (b) { return matchesFamily(b.style, famA) && b.rating != null; });
    var beersB = data.filter(function (b) { return matchesFamily(b.style, famB) && b.rating != null; });
    var ratingsA = beersA.map(function (b) { return b.rating; });
    var ratingsB = beersB.map(function (b) { return b.rating; });
    var avgA = avg(ratingsA);
    var avgB = avg(ratingsB);
    var sdA = stdDev(ratingsA);
    var sdB = stdDev(ratingsB);
    var medA = median(ratingsA);
    var medB = median(ratingsB);
    var abvA = beersA.filter(function(b){return b._abv>0;}).map(function(b){return b._abv;});
    var abvB = beersB.filter(function(b){return b._abv>0;}).map(function(b){return b._abv;});
    var avgAbvA = abvA.length ? avg(abvA) : 0;
    var avgAbvB = abvB.length ? avg(abvB) : 0;
    var eliteA = beersA.filter(function(b){return b.rating >= 9;}).length;
    var eliteB = beersB.filter(function(b){return b.rating >= 9;}).length;
    var elitePctA = beersA.length ? (eliteA / beersA.length * 100) : 0;
    var elitePctB = beersB.length ? (eliteB / beersB.length * 100) : 0;
    var bestA = beersA.slice().sort(function (a, b) { return b.rating - a.rating; })[0];
    var bestB = beersB.slice().sort(function (a, b) { return b.rating - a.rating; })[0];
    var winner = avgA > avgB ? famA : avgB > avgA ? famB : 'Tie';
    var colorA = '#f0a030', colorB = '#5cc8ff';

    // Kevin's verdict
    var verdictParts = [];
    var diff = Math.abs(avgA - avgB);
    if (diff < 0.15) {
      verdictParts.push('Nearly identical averages — this is a dead heat.');
    } else {
      verdictParts.push(esc(winner) + ' edges out by ' + diff.toFixed(2) + ' points.');
    }
    if (sdA < sdB - 0.1) {
      verdictParts.push(esc(famA) + ' is more consistent (\u00B1' + sdA.toFixed(2) + ' vs \u00B1' + sdB.toFixed(2) + ').');
    } else if (sdB < sdA - 0.1) {
      verdictParts.push(esc(famB) + ' is more consistent (\u00B1' + sdB.toFixed(2) + ' vs \u00B1' + sdA.toFixed(2) + ').');
    }
    if (elitePctA > elitePctB + 3) {
      verdictParts.push(esc(famA) + ' has a higher elite hit rate (' + elitePctA.toFixed(0) + '% vs ' + elitePctB.toFixed(0) + '% score 9+).');
    } else if (elitePctB > elitePctA + 3) {
      verdictParts.push(esc(famB) + ' has a higher elite hit rate (' + elitePctB.toFixed(0) + '% vs ' + elitePctA.toFixed(0) + '% score 9+).');
    }

    result.innerHTML =
      '<div class="showdown-result">' +
        '<div class="showdown-winner">' +
          (winner === 'Tie' ? '\uD83E\uDD1D It\'s a tie!' : '\uD83C\uDFC6 ' + esc(winner) + ' wins!') +
        '</div>' +
        '<div class="showdown-bars">' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Avg Rating</div>' +
            '<div class="showdown-bar-track"><div class="showdown-bar-fill" style="width:' + (avgA / 10 * 100) + '%;background:' + colorA + '"></div></div>' +
            '<div class="showdown-bar-val" style="color:' + colorA + '">' + avgA.toFixed(2) + '</div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label"></div>' +
            '<div class="showdown-bar-track"><div class="showdown-bar-fill" style="width:' + (avgB / 10 * 100) + '%;background:' + colorB + '"></div></div>' +
            '<div class="showdown-bar-val" style="color:' + colorB + '">' + avgB.toFixed(2) + '</div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Count</div>' +
            '<div style="flex:1;font-size:.82rem;color:var(--text-2)">' +
              '<span style="color:' + colorA + '">' + beersA.length + '</span> vs <span style="color:' + colorB + '">' + beersB.length + '</span>' +
            '</div>' +
            '<div style="width:42px"></div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Consistency</div>' +
            '<div style="flex:1;font-size:.82rem;color:var(--text-2)">' +
              '<span style="color:' + colorA + '">\u00B1' + sdA.toFixed(2) + '</span> vs <span style="color:' + colorB + '">\u00B1' + sdB.toFixed(2) + '</span>' +
            '</div>' +
            '<div style="width:42px"></div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Median</div>' +
            '<div style="flex:1;font-size:.82rem;color:var(--text-2)">' +
              '<span style="color:' + colorA + '">' + medA.toFixed(1) + '</span> vs <span style="color:' + colorB + '">' + medB.toFixed(1) + '</span>' +
            '</div>' +
            '<div style="width:42px"></div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Avg ABV</div>' +
            '<div style="flex:1;font-size:.82rem;color:var(--text-2)">' +
              '<span style="color:' + colorA + '">' + avgAbvA.toFixed(1) + '%</span> vs <span style="color:' + colorB + '">' + avgAbvB.toFixed(1) + '%</span>' +
            '</div>' +
            '<div style="width:42px"></div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Elite (9+)</div>' +
            '<div style="flex:1;font-size:.82rem;color:var(--text-2)">' +
              '<span style="color:' + colorA + '">' + eliteA + ' (' + elitePctA.toFixed(0) + '%)</span> vs <span style="color:' + colorB + '">' + eliteB + ' (' + elitePctB.toFixed(0) + '%)</span>' +
            '</div>' +
            '<div style="width:42px"></div>' +
          '</div>' +
          '<div class="showdown-bar-row">' +
            '<div class="showdown-bar-label">Best beer</div>' +
            '<div style="flex:1;font-size:.78rem;color:var(--text-3);line-height:1.3">' +
              '<span style="color:' + colorA + '">' + (bestA ? esc(bestA.beer) + ' (' + bestA.rating + ')' : '\u2014') + '</span> vs ' +
              '<span style="color:' + colorB + '">' + (bestB ? esc(bestB.beer) + ' (' + bestB.rating + ')' : '\u2014') + '</span>' +
            '</div>' +
            '<div style="width:42px"></div>' +
          '</div>' +
        '</div>' +
        '<div style="margin-top:12px;padding:10px 12px;background:rgba(240,160,48,.06);border:1px solid rgba(240,160,48,.15);border-radius:8px;font-size:.78rem;color:var(--text-2);line-height:1.45">' +
          '<strong style="color:var(--gold)">\uD83C\uDF7A Kevin\'s Verdict:</strong> ' + verdictParts.join(' ') +
        '</div>' +
      '</div>';
  }

  // ── Feature 5: Scavenger Hunt ──────────────────────────
  var huntChallenges = [];

  function buildHuntChallenges() {
    var outstandingBeers = data.filter(function (b) { return b.simpleRating === 'Outstanding'; });
    var regions = [...new Set(data.map(function (b) { return b.state; }).filter(Boolean))];
    var topBrews = Object.entries(
      data.reduce(function (m, b) { m[b.brewery] = (m[b.brewery] || 0) + 1; return m; }, {})
    ).filter(function (e) { return e[1] >= 10; }).map(function (e) { return e[0]; });

    huntChallenges = [
      { mission: 'Find a Perfect 10', desc: 'Can you find one of the rare beers Kevin gave a perfect 10/10?', hint: 'Only ' + data.filter(function (b) { return b.rating === 10; }).length + ' exist. Try sorting by rating.' },
      { mission: 'California Sour Hunt', desc: 'Find an Outstanding sour from California.', hint: 'Use the Style and Region filters together.' },
      { mission: 'The Coffee Stout', desc: 'Find a coffee stout rated 9 or higher.', hint: 'Try searching "coffee" with the Stout style family.' },
      { mission: 'Double Digit ABV', desc: 'Find a 10%+ ABV beer that Kevin rated Outstanding.', hint: 'Combine Imperial ABV filter with Outstanding rating.' },
      { mission: 'Oregon Trail', desc: 'Find Kevin\'s highest-rated beer from Oregon.', hint: 'Filter by OR region, sort by rating.' },
      { mission: 'Barrel Treasure', desc: 'Find a barrel-aged beer rated 9.5 or higher.', hint: 'Use the "Barrel Aged" preset, then sort by rating.' },
      { mission: 'The Hop Unicorn', desc: 'Find an IPA rated 9.5+ from outside California.', hint: 'This takes some digging through the filters!' },
      { mission: 'Dark Horse', desc: 'Find a porter or stout from a brewery Kevin only tried once.', hint: 'Look for one-off breweries in the dark beer styles.' },
      { mission: 'Sour Surprise', desc: 'Find a sour with chocolate or cherry notes rated 8.5+.', hint: 'Combine search terms with the sour preset.' },
      { mission: 'Belgian Beauty', desc: 'Find Kevin\'s favorite Belgian-style beer.', hint: 'Filter by the Belgian style family, sort by rating.' },
    ];
  }

  function generateHunt() {
    if (!huntChallenges.length) buildHuntChallenges();
    var challenge = huntChallenges[Math.floor(Math.random() * huntChallenges.length)];
    var el = document.getElementById('huntChallenge');
    if (!el) return;
    el.innerHTML =
      '<div class="hunt-mission">🎯 ' + esc(challenge.mission) + '</div>' +
      '<p class="hunt-desc">' + esc(challenge.desc) + '</p>' +
      '<p class="hunt-hint">💡 Hint: ' + esc(challenge.hint) + '</p>';
  }

  // ── Feature 7: Kevin vs. The World ─────────────────────
  function renderKevinVsAverage() {
    var container = document.getElementById('vsContent');
    if (!container) return;

    // "Average" beer drinker preferences (general industry consensus)
    var worldPrefs = [
      { label: 'IPAs', kevinPref: 'high', worldPref: 'very high', note: 'IPAs dominate both' },
      { label: 'Sours', kevinPref: 'very high', worldPref: 'medium', note: 'Kevin explores sours way more than average' },
      { label: 'Stouts', kevinPref: 'high', worldPref: 'medium', note: 'Kevin dives deeper into the dark side' },
      { label: 'Lagers', kevinPref: 'low', worldPref: 'very high', note: 'Kevin skips the mainstream lagers' },
      { label: 'Belgians', kevinPref: 'medium', worldPref: 'low', note: 'Kevin appreciates Belgian complexity' },
    ];

    var rated = data.filter(function (b) { return b.rating != null; });
    var familyCounts = {};
    var familyRatings = {};
    Object.keys(STYLE_FAMILY_MAP).forEach(function (fam) {
      var beers = data.filter(function (b) { return matchesFamily(b.style, fam); });
      familyCounts[fam] = beers.length;
      var ratedBeers = beers.filter(function (b) { return b.rating != null; });
      familyRatings[fam] = ratedBeers.length ? avg(ratedBeers.map(function (b) { return b.rating; })) : 0;
    });

    var sortedByCount = Object.entries(familyCounts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var overallAvg = avg(rated.map(function (b) { return b.rating; }));

    var html = '<div style="font-size:.78rem;color:var(--text-3);margin-bottom:8px;text-align:center">Kevin\'s avg: ' + overallAvg.toFixed(1) + ' across ' + rated.length + ' rated beers</div>';
    html += sortedByCount.map(function (entry) {
      var fam = entry[0], count = entry[1];
      var famAvg = familyRatings[fam];
      var diff = famAvg - overallAvg;
      var diffClass = diff > 0.15 ? 'up' : diff < -0.15 ? 'down' : 'same';
      var diffText = diff > 0 ? '+' + diff.toFixed(1) : diff.toFixed(1);
      return '<div class="vs-row">' +
        '<div class="vs-label">' + esc(fam) + '</div>' +
        '<div style="flex:1;font-size:.72rem;color:var(--text-3)">' + count + ' beers</div>' +
        '<div class="vs-kevin">' + famAvg.toFixed(1) + '</div>' +
        '<div class="vs-diff ' + diffClass + '">' + diffText + '</div>' +
      '</div>';
    }).join('');

    html += '<div style="font-size:.7rem;color:var(--text-3);margin-top:8px;text-align:center">Diff shows how each style compares to Kevin\'s overall avg. <span style="color:var(--green)">Green</span> = Kevin likes it more than most.</div>';
    container.innerHTML = html;
  }

  // ── Feature 9: Exploration Progress ────────────────────
  function renderExplorationProgress() {
    var container = document.getElementById('progressContent');
    if (!container) return;

    var families = ['IPA', 'Stout', 'Sour', 'Lager', 'Saison', 'Porter', 'Belgian', 'Wheat', 'Pale Ale', 'Barleywine'];
    // Reasonable "deep exploration" thresholds per family
    var thresholds = { IPA: 600, Stout: 300, Sour: 400, Lager: 100, Saison: 300, Porter: 100, Belgian: 80, Wheat: 60, 'Pale Ale': 120, Barleywine: 40 };

    var html = families.map(function (fam) {
      var count = data.filter(function (b) { return matchesFamily(b.style, fam); }).length;
      var threshold = thresholds[fam] || 100;
      var pct = Math.min(100, Math.round(count / threshold * 100));
      return '<div class="progress-row">' +
        '<div class="progress-label">' + esc(fam) + '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="progress-pct">' + pct + '%</div>' +
        '<div class="progress-count">' + count + '/' + threshold + '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;
  }

  // ── Feature 10: Shareable Stat Cards ───────────────────
  function renderShareCards() {
    var container = document.getElementById('shareCardsRow');
    if (!container) return;

    var total = data.length;
    var breweries = new Set(data.map(function (b) { return b.brewery; }).filter(Boolean)).size;
    var styles = new Set(data.map(function (b) { return b.style; }).filter(Boolean)).size;
    var rated = data.filter(function (b) { return b.rating != null; });
    var avgR = avg(rated.map(function (b) { return b.rating; }));
    var outstanding = data.filter(function (b) { return b.simpleRating === 'Outstanding'; }).length;

    var cards = [
      { emoji: '🍺', num: total.toLocaleString(), label: 'Beers Rated', cls: 'share-card-amber', text: 'Kevin has rated ' + total + ' different beers. That\'s not a hobby, it\'s a lifestyle. #KevMo' },
      { emoji: '🏭', num: breweries.toLocaleString(), label: 'Breweries', cls: 'share-card-cyan', text: breweries + ' breweries explored — Kevin\'s liver has logged more miles than most frequent flyers. #KevMo' },
      { emoji: '🎨', num: styles.toString(), label: 'Styles Tried', cls: 'share-card-purple', text: styles + ' different beer styles tried. Kevin doesn\'t have a type — he has a spreadsheet. #KevMo' },
      { emoji: '⭐', num: avgR.toFixed(1), label: 'Avg Rating', cls: 'share-card-green', text: 'Kevin\'s average: ' + avgR.toFixed(1) + '/10. Fair but firm. Your favorite beer is probably a 7. #KevMo' },
      { emoji: '🏆', num: outstanding.toString(), label: 'Outstanding', cls: 'share-card-pink', text: 'Only ' + outstanding + ' beers earned "Outstanding" — the rarest badge in Kevin\'s universe. #KevMo' },
    ];

    container.innerHTML = cards.map(function (c) {
      return '<div class="share-stat-card ' + c.cls + '" data-share="' + esc(c.text) + '">' +
        '<span class="share-stat-emoji">' + c.emoji + '</span>' +
        '<span class="share-stat-num">' + esc(c.num) + '</span>' +
        '<span class="share-stat-label">' + esc(c.label) + '</span>' +
      '</div>';
    }).join('');
  }

  // ── Feature 6: Welcome Tour ────────────────────────────
  function showWelcomeTour() {
    var welcomed = false;
    try { welcomed = localStorage.getItem('kevmo-welcomed') === '1'; } catch (e) {}
    if (welcomed) return;

    var total = data.length;
    var breweries = new Set(data.map(function (b) { return b.brewery; }).filter(Boolean)).size;
    var styles = new Set(data.map(function (b) { return b.style; }).filter(Boolean)).size;
    var topBrew = Object.entries(
      data.reduce(function (m, b) { m[b.brewery] = (m[b.brewery] || 0) + 1; return m; }, {})
    ).sort(function (a, b) { return b[1] - a[1]; })[0];

    var content = document.getElementById('welcomeContent');
    if (!content) return;

    content.innerHTML =
      '<div class="welcome-step">' +
        '<span class="welcome-hero-emoji">🍻</span>' +
        '<h2 class="welcome-title">Welcome to KevMo!</h2>' +
        '<p class="welcome-subtitle">You just stumbled into <strong>' + total.toLocaleString() + ' beer ratings</strong> from one incredibly dedicated drinker. Here\'s how to get the most out of&nbsp;it:</p>' +
        '<div class="welcome-stats">' +
          '<div class="welcome-stat"><span class="welcome-stat-num">' + total.toLocaleString() + '</span><span class="welcome-stat-label">Beers</span></div>' +
          '<div class="welcome-stat"><span class="welcome-stat-num">' + breweries.toLocaleString() + '</span><span class="welcome-stat-label">Breweries</span></div>' +
          '<div class="welcome-stat"><span class="welcome-stat-num">' + styles + '</span><span class="welcome-stat-label">Styles</span></div>' +
        '</div>' +
        '<div class="welcome-highlights">' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">🔍</span><span class="welcome-highlight-text"><strong>Search & Filter</strong> — Dig into ' + total.toLocaleString() + ' beers by style, region, ABV, or just vibe</span></div>' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">📊</span><span class="welcome-highlight-text"><strong>Insights</strong> — Charts and patterns that reveal Kevin\'s deepest beer&nbsp;truths</span></div>' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">🏆</span><span class="welcome-highlight-text"><strong>Leaderboards</strong> — The definitive rankings for breweries, styles, and&nbsp;regions</span></div>' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">🎮</span><span class="welcome-highlight-text"><strong>Play</strong> — Quiz yourself, battle styles head-to-head, and go on scavenger&nbsp;hunts</span></div>' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">🎲</span><span class="welcome-highlight-text"><strong>Random</strong> — Hit the dice for a surprise pick from Kevin\'s entire&nbsp;collection</span></div>' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">✈️</span><span class="welcome-highlight-text"><strong>Tasting Flights</strong> — Generate a curated flight of diverse beers for your next tasting&nbsp;party</span></div>' +
          '<div class="welcome-highlight"><span class="welcome-highlight-emoji">⭐</span><span class="welcome-highlight-text"><strong>Today\'s Pick</strong> — A new featured beer every day, hand-picked by the&nbsp;algorithm</span></div>' +
        '</div>' +
        '<button class="welcome-btn" id="welcomeStart">Let\'s Go — Show Me the Beers 🍺</button>' +
      '</div>';

    document.getElementById('welcomeModal').style.display = '';
    document.body.classList.add('modal-open');

    document.getElementById('welcomeStart').addEventListener('click', function () {
      document.getElementById('welcomeModal').style.display = 'none';
      document.body.classList.remove('modal-open');
      try { localStorage.setItem('kevmo-welcomed', '1'); } catch (e) {}
    });
  }

  // ── Play View Orchestrator ─────────────────────────────
  var playViewInit = false;
  function renderPlayView() {
    if (!playViewInit) {
      populateShowdownDropdowns();
      buildHuntChallenges();
      generateHunt();
      playViewInit = true;
    }
    renderKevinVsAverage();
    renderExplorationProgress();
    renderShareCards();
  }

  // ══════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════

  function init() {
    cacheDom();
    populateDropdowns();
    bindEvents();

    // Inject dynamic styles for new features
    var dynamicStyle = document.createElement('style');
    dynamicStyle.textContent =
      '.flight-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px}' +
      '.flight-controls .filter-group{flex:1;min-width:140px}' +
      '.flight-controls .play-btn{align-self:end;white-space:nowrap}' +
      '.flight-beers{display:flex;flex-direction:column;gap:8px}' +
      '.flight-beer-card{display:flex;gap:12px;align-items:flex-start;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;transition:background .15s}' +
      '.flight-beer-card:hover{background:rgba(240,160,48,.08);border-color:rgba(240,160,48,.2)}' +
      '.flight-num{font-size:1.1rem;font-weight:800;color:var(--amber-l);min-width:24px;text-align:center;padding-top:2px}' +
      '.flight-info{flex:1;min-width:0}' +
      '.flight-result h4{font-size:1rem;font-weight:700}';
    document.head.appendChild(dynamicStyle);

    // Restore state from URL hash
    var hadState = loadStateFromHash();

    applyFilters();
    renderCards();
    updateResultCount();
    renderPills();
    updateClearButton();
    initHeroStats();
    renderAchievements();
    initFunFacts();
    renderAwards();

    // If URL had a view, switch to it
    if (hadState && currentView !== 'cards') {
      switchView(currentView);
    }
    if (hadState && currentLb !== 'breweries') {
      $$('.lb-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.lb === currentLb); });
    }

    showWelcomeTour();

    // Listen for hash changes (back/forward)
    window.addEventListener('hashchange', function() {
      loadStateFromHash();
      applyFilters();
      renderPills();
      renderCards();
      updateResultCount();
      updateClearButton();
      switchView(currentView);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
