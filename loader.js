/* loader.js — Fetch Beer2.xlsx from Dropbox, parse "beer" tab, set BEER_DATA */
(function () {
  'use strict';

  var DROPBOX_URL = '/api/beer-data';

  // Column header → object key mapping
  var COL_MAP = {
    'Beer':           'beer',
    'Brewery':        'brewery',
    'City':           'city',
    'State/Country':  'state',
    'State / Country':'state',
    'Style':          'style',
    'ABV':            'abv',
    'Serving Type':   'servingType',
    'Purchased':      'purchased',
    'Rating':         'rating',
    'Tasting Notes':  'tastingNotes',
    'Hops':           'hops',
    'Simple Rating':  'simpleRating',
    'Adjuncts':       'adjuncts',
    'Barrel':         'barrel',
    'Time':           'barrelTime'
  };

  var messages = [
    'Kevin is pouring the data…',
    'Sniffing the hops…',
    'Checking the ABV…',
    'Rating every last drop…',
    'Consulting the tasting notes…',
    'Warming up the glassware…',
    'Debating IPA vs. lager…',
    'One more sip for science…'
  ];

  var overlay = document.getElementById('loadingOverlay');
  var msgEl   = document.getElementById('loadingMessage');

  // Rotate fun messages while loading
  var msgIdx = 0;
  var msgTimer = setInterval(function () {
    msgIdx = (msgIdx + 1) % messages.length;
    if (msgEl) msgEl.textContent = messages[msgIdx];
  }, 2400);

  function hideLoader() {
    clearInterval(msgTimer);
    if (overlay) {
      overlay.classList.add('loaded');
      setTimeout(function () { overlay.style.display = 'none'; }, 600);
    }
  }

  function formatAbv(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'string') {
      // Already formatted like "6.8%"
      if (val.indexOf('%') !== -1) return val.replace(/%%/g, '%').trim();
      var n = parseFloat(val);
      if (isNaN(n)) return val;
      val = n;
    }
    // Excel stores 6.8% as 0.068
    if (typeof val === 'number') {
      if (val > 0 && val < 1) return (val * 100).toFixed(1) + '%';
      return val.toFixed(1) + '%';
    }
    return String(val);
  }

  function parseRow(raw, idx) {
    var obj = { id: idx };
    for (var header in COL_MAP) {
      var key = COL_MAP[header];
      var val = raw[header];
      if (val == null) val = '';
      if (key === 'abv') {
        obj[key] = formatAbv(val);
      } else if (key === 'rating') {
        obj[key] = typeof val === 'number' ? val : parseFloat(val) || 0;
      } else {
        obj[key] = String(val).trim();
      }
    }
    return obj;
  }

  function loadFromDropbox() {
    return fetch(DROPBOX_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Dropbox fetch failed: ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buf) {
        var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        // Use the first sheet (the "beer" tab)
        var sheetName = wb.SheetNames[0];
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        return rows.map(parseRow);
      });
  }

  function boot(beerData) {
    window.BEER_DATA = beerData;
    // Dynamically load app.js now that BEER_DATA is set
    var s = document.createElement('script');
    s.src = 'app.js';
    s.onload = hideLoader;
    s.onerror = function () {
      console.error('Failed to load app.js');
      hideLoader();
    };
    document.body.appendChild(s);
  }

  // Go!
  loadFromDropbox()
    .then(boot)
    .catch(function (err) {
      console.error('Loader error:', err);
      if (msgEl) msgEl.textContent = 'Failed to load data — trying local backup…';
      // Fallback: try loading data.js
      var s = document.createElement('script');
      s.src = 'data.js';
      s.onload = function () {
        boot(typeof BEER_DATA !== 'undefined' ? BEER_DATA : []);
      };
      s.onerror = function () {
        if (msgEl) msgEl.textContent = 'Could not load beer data. Please refresh.';
      };
      document.body.appendChild(s);
    });
})();
