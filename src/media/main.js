(function () {
  var vscode = acquireVsCodeApi();
  var allFonts = [];
  var categories = {};
  var installed = {};
  var currentFont = '';
  var currentFilter = 'handwriting';
  var searchQuery = '';
  var PREVIEW_TEXT = 'Hamburgevons 123';

  function setInstalled(list) {
    installed = {};
    (list || []).forEach(function (f) { installed[f] = true; });
  }

  function getFilteredFonts() {
    return allFonts.filter(function (f) {
      var matchFilter = currentFilter === 'all' || categories[f] === currentFilter;
      var matchSearch = f.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1;
      return matchFilter && matchSearch;
    });
  }

  function renderFonts() {
    var filtered = getFilteredFonts();
    var fontCount = document.getElementById('fontCount');
    var fontList = document.getElementById('fontList');
    fontCount.textContent = filtered.length + ' font' + (filtered.length !== 1 ? 's' : '');
    if (filtered.length === 0) {
      fontList.innerHTML = '<div class="no-results">No fonts found</div>';
      return;
    }
    fontList.innerHTML = filtered.map(function (font) {
      var cat = categories[font] || '';
      var using = currentFont.toLowerCase() === font.toLowerCase();
      return '<div class="font-card' + (using ? ' active' : '') + '" data-font="' + font + '">' +
        '<div class="font-name"><span>' + font + '</span>' + (installed[font]
          ? '<span>' + (using ? '<span class="font-badge using-badge">✓ using</span>' : '<span class="font-badge">✓ installed</span>') + '<span class="font-delete" data-font="' + font + '" title="Uninstall font">🗑</span></span>'
          : '<span class="font-install" data-font="' + font + '" title="Install and apply this font">⤓ install</span>') + '</div>' +
        '<div class="font-preview" style="font-family: \'' + font + '\', monospace;">' + PREVIEW_TEXT + '</div>' +
        '<div class="font-category">' + cat + '</div>' +
      '</div>';
    }).join('');

    var cards = fontList.querySelectorAll('.font-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target : null;
        var delBtn = el && el.closest ? el.closest('.font-delete') : null;
        if (delBtn) {
          vscode.postMessage({ type: 'uninstallFont', font: delBtn.getAttribute('data-font') });
          return;
        }
        var dlBtn = el && el.closest ? el.closest('.font-install') : null;
        if (dlBtn) {
          var installFont = dlBtn.getAttribute('data-font');
          var installStatus = document.getElementById('status');
          installStatus.textContent = 'Installing ' + installFont + '...';
          installStatus.className = 'status';
          vscode.postMessage({ type: 'applyFont', font: installFont });
          return;
        }
        var font = this.getAttribute('data-font');
        var statusEl = document.getElementById('status');
        statusEl.textContent = 'Applying ' + font + '...';
        statusEl.className = 'status';
        vscode.postMessage({ type: 'applyFont', font: font });
        var allCards = fontList.querySelectorAll('.font-card');
        for (var j = 0; j < allCards.length; j++) { allCards[j].classList.remove('active'); }
        this.classList.add('active');
        currentFont = font;
      });
    }
  }

  document.getElementById('search').addEventListener('input', function (e) {
    searchQuery = e.target.value;
    renderFonts();
  });

  var installFileBtn = document.getElementById('installFileBtn');
  if (installFileBtn) {
    installFileBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'installFile' });
    });
  }

  var installUrlBtn = document.getElementById('installUrlBtn');
  if (installUrlBtn) {
    installUrlBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'installUrl' });
    });
  }

  var restoreDefaultBtn = document.getElementById('restoreDefaultBtn');
  if (restoreDefaultBtn) {
    restoreDefaultBtn.addEventListener('click', function () {
      var statusEl = document.getElementById('status');
      statusEl.textContent = 'Restoring default font...';
      statusEl.className = 'status';
      vscode.postMessage({ type: 'restoreDefaultFont' });
    });
  }

  var filterBtns = document.querySelectorAll('.filter-btn');
  for (var i = 0; i < filterBtns.length; i++) {
    filterBtns[i].addEventListener('click', function () {
      for (var j = 0; j < filterBtns.length; j++) { filterBtns[j].classList.remove('active'); }
      this.classList.add('active');
      currentFilter = this.getAttribute('data-filter');
      renderFonts();
    });
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.type === 'init') {
      allFonts = msg.fonts;
      categories = msg.categories;
      currentFont = msg.currentFont || '';
      setInstalled(msg.installed);
      renderFonts();
    } else if (msg.type === 'installed') {
      if (msg.fonts) {
        allFonts = msg.fonts;
        categories = msg.categories || categories;
      }
      currentFont = msg.currentFont || currentFont;
      setInstalled(msg.installed);
      renderFonts();
    } else if (msg.type === 'applied') {
      var status = document.getElementById('status');
          status.textContent = 'Applied: ' + msg.font;
      status.className = 'status ok';
    }
  });

  renderFonts();
  vscode.postMessage({ type: 'ready' });
})();
