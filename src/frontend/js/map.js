/* =============================================
   DeTECT — Map Dashboard Logic
   Firebase Client SDK v8 + MapLibre GL JS
   ============================================= */

(function () {
  'use strict';

  // Guard: don't double-initialize if already loaded
  if (window._detectMapInitialized) return;
  window._detectMapInitialized = true;

  // ==============================
  // Firebase initialisation
  // ==============================
  // firebaseConfig is provided by js/firebaseConfig.js loaded before this script
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.database();

  // ==============================
  // Offline / connection state
  // ==============================
  const LIVE_FIELDS = ['stat-total', 'stat-avg-severity', 'stat-low', 'stat-high',
                        'legend-low', 'legend-mid', 'legend-high', 'float-count',
                        'hero-live-count', 'summary-live-count'];

  function setOfflinePlaceholder() {
    LIVE_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }

  const connRef = db.ref('.info/connected');
  connRef.on('value', (snap) => {
    if (!snap.val()) {
      setOfflinePlaceholder();
    }
  });

  // ==============================
  // Map styles
  // ==============================
  const mapStyles = {
    streets: 'https://tiles.openfreemap.org/styles/liberty',
    satellite: 'https://tiles.openfreemap.org/styles/liberty', // fallback
    dark: {
      version: 8, name: 'Dark',
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
          ],
          tileSize: 256,
          attribution: '&copy; CARTO &copy; OSM'
        }
      },
      layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 20 }]
    }
  };

  // ==============================
  // Map initialisation
  // ==============================
  var mapContainer = document.getElementById('map');
  if (!mapContainer) return; // not on the map page

  var map = new maplibregl.Map({
    container: 'map',
    style: mapStyles.dark,
    center: [73.8567, 18.5204],
    zoom: 13,
    maxZoom: 20, minZoom: 3
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-right');

  map.on('load', function () {
    var loader = document.getElementById('map-loader');
    if (loader) loader.classList.add('hidden');
  });

  map.on('zoom', function () {
    var el = document.getElementById('zoom-badge');
    if (el) el.textContent = 'Zoom: ' + map.getZoom().toFixed(1);
  });

  map.on('move', function () {
    var el = document.getElementById('coords-badge');
    if (el) {
      var c = map.getCenter();
      el.textContent = c.lat.toFixed(4) + '°N, ' + c.lng.toFixed(4) + '°E';
    }
  });

  // ==============================
  // Style switcher (global function used by inline onclick handlers in HTML)
  // ==============================
  window.switchStyle = function (styleName) {
    document.querySelectorAll('.style-option').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.getElementById('style-' + styleName);
    if (btn) btn.classList.add('active');
    map.setStyle(mapStyles[styleName]);
  };

  map.on('styledata', function () {
    markers.forEach(function (m) { m.addTo(map); });
  });

  // ==============================
  // Severity helpers
  // ==============================
  function getSeverityColor(s) {
    if (s <= 4) return '#10b981';
    if (s <= 7) return '#f59e0b';
    return '#ef4444';
  }
  function getSeverityClass(s) {
    if (s <= 4) return 'ds-low';
    if (s <= 7) return 'ds-mid';
    return 'ds-high';
  }
  function getSeverityLabel(s) {
    if (s <= 4) return 'Low';
    if (s <= 7) return 'Medium';
    return 'High';
  }

  // ==============================
  // Pothole state
  // ==============================
  var markers = [];
  var totalCount = 0;
  var totalSeverity = 0;
  var lowCount = 0;
  var midCount = 0;
  var highCount = 0;
  var recentDetections = [];

  function updateStats() {
    var setEl = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
    setEl('stat-total', totalCount);
    setEl('stat-avg-severity', totalCount > 0 ? (totalSeverity / totalCount).toFixed(1) : '—');
    setEl('stat-low', lowCount);
    setEl('stat-high', highCount);
    setEl('legend-low', lowCount);
    setEl('legend-mid', midCount);
    setEl('legend-high', highCount);
    setEl('float-count', totalCount + ' potholes detected');
  }

  function addDetectionItem(lat, lon, severity) {
    var listEl = document.getElementById('detections-list');
    if (!listEl) return;
    if (recentDetections.length === 0) listEl.innerHTML = '';
    recentDetections.unshift({ lat: lat, lon: lon, severity: severity });
    if (recentDetections.length > 8) recentDetections.pop();
    listEl.innerHTML = recentDetections.map(function (d) {
      return '<div class="detection-item" onclick="map.flyTo({center:[' + d.lon + ',' + d.lat + '],zoom:16,duration:1200})">' +
        '<div class="detection-severity ' + getSeverityClass(d.severity) + '">' + d.severity + '</div>' +
        '<div class="detection-meta">' +
          '<div class="detection-coords">' + Number(d.lat).toFixed(5) + ', ' + Number(d.lon).toFixed(5) + '</div>' +
          '<div class="detection-status">' + getSeverityLabel(d.severity) + ' Risk <span class="chain-badge">⛓ On-Chain</span></div>' +
        '</div></div>';
    }).join('');
  }

  // ==============================
  // Firebase child_added listener — CANONICAL PATH: potholes (lowercase)
  // ==============================
  var potholesRef = db.ref('potholes');

  potholesRef.on('child_added', function (snapshot) {
    var p = snapshot.val();
    if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;

    var lat = p.latitude;
    var lon = p.longitude;
    var severity = typeof p.severity === 'number' ? p.severity : 5;
    var color = getSeverityColor(severity);

    // Update counters
    totalCount++;
    totalSeverity += severity;
    if (severity <= 4) lowCount++;
    else if (severity <= 7) midCount++;
    else highCount++;
    updateStats();
    addDetectionItem(lat, lon, severity);

    // Create marker element
    var el = document.createElement('div');
    el.style.cssText = 'width:14px;height:14px;background:' + color +
      ';border-radius:50%;border:2px solid rgba(255,255,255,0.25);' +
      'box-shadow:0 0 8px ' + color + '80,0 0 16px ' + color + '30;' +
      'cursor:pointer;transition:transform 0.2s ease,box-shadow 0.2s ease;';
    el.addEventListener('mouseenter', function () {
      el.style.transform = 'scale(1.6)';
      el.style.boxShadow = '0 0 16px ' + color + ',0 0 32px ' + color + '60';
    });
    el.addEventListener('mouseleave', function () {
      el.style.transform = 'scale(1)';
      el.style.boxShadow = '0 0 8px ' + color + '80,0 0 16px ' + color + '30';
    });

    var popupHTML = '<div class="popup-header">' +
      '<div class="popup-sev-badge" style="background:' + color + '18;color:' + color + ';border:1px solid ' + color + '30;">' + severity + '</div>' +
      '<div class="popup-header-text">' +
        '<div class="popup-header-title">POTHOLE DETECTED</div>' +
        '<div class="popup-header-sub">' + getSeverityLabel(severity) + ' Risk · Severity ' + severity + '/10</div>' +
      '</div></div>' +
      '<div class="popup-body">' +
        '<div class="popup-row"><span class="popup-key">Latitude</span><span class="popup-val">' + lat.toFixed(6) + '</span></div>' +
        '<div class="popup-row"><span class="popup-key">Longitude</span><span class="popup-val">' + lon.toFixed(6) + '</span></div>' +
        '<div class="popup-row"><span class="popup-key">Severity</span><span class="popup-val">' + severity + '/10</span></div>' +
        '<div class="popup-row"><span class="popup-key">Status</span><span class="popup-val popup-chain-tag">⛓ On-Chain</span></div>' +
      '</div>';

    var marker = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .setPopup(new maplibregl.Popup({ offset: 12, closeButton: true }).setHTML(popupHTML))
      .addTo(map);

    markers.push(marker);
  }, function (error) {
    console.error('Firebase read error:', error.message);
    setOfflinePlaceholder();
  });

  // ==============================
  // Mini map (landing page) — also uses canonical 'potholes' path
  // ==============================
  var miniMapContainer = document.getElementById('mini-map');
  if (miniMapContainer && typeof maplibregl !== 'undefined') {
    var miniMap = new maplibregl.Map({
      container: 'mini-map',
      style: mapStyles.dark,
      center: [73.8567, 18.5204],
      zoom: 11,
      interactive: true
    });

    db.ref('potholes').on('child_added', function (snap) {
      var p = snap.val();
      if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
      var s = typeof p.severity === 'number' ? p.severity : 5;
      var col = getSeverityColor(s);
      var el2 = document.createElement('div');
      el2.style.cssText = 'width:10px;height:10px;background:' + col + ';border-radius:50%;' +
        'border:1px solid rgba(255,255,255,0.2);box-shadow:0 0 6px ' + col + '80;cursor:pointer;';
      new maplibregl.Marker({ element: el2 }).setLngLat([p.longitude, p.latitude]).addTo(miniMap);
    });
  }

})();
