// assets/js/try/reader.js
(() => {
  function start() {
    /* ==================== Element handles ==================== */
    const $ = (sel) => document.querySelector(sel);
    const drop        = $('#dropZone');
    const input       = $('#fileInput');
    if (!drop && !input) return;

    window.__OREADER_BOOT_OK = true;
    console.log('O-Reader JS boot ✓');

    const log         = $('#log');
    const pill        = $('#countPill');
    const statsBox    = $('#stats');

    const btnClassify = $('#btnClassify');
    const btnClear    = $('#btnClear');
    const btnSamples  = $('#btnSamples');
    const btnExport   = $('#btnExport');
    const btnList     = $('#btnList');
    const btnFolders  = $('#btnFolders');
    const copySetup   = $('#copySetup');
    const setupBlock  = $('#setupBlock');

    /* ==================== Config ==================== */
    const MAX_FILES = 10;
    const ALLOW_EXTS = ['.pdf'];
    const LABELS = ['invoice', 'contract', 'cv', 'unknown'];

    /* ==================== State ==================== */
    let files = [];
    let results = [];
    let viewMode = 'list';

    /* ==================== Helpers ==================== */
    const show = (msg) => { if (statsBox) statsBox.textContent = msg; };

    const isPdf = (file) => {
      const name = (file?.name || '').toLowerCase();
      return file?.type === 'application/pdf' || ALLOW_EXTS.some(ext => name.endsWith(ext));
    };

    const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;

    const clip = (v) => String(v).replace(/"/g, '""');

    const updatePill = () => {
      if (pill) pill.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
    };

    /* ==================== File management ==================== */
    function addFiles(list) {
      let added = 0;
      for (const f of list) {
        if (!isPdf(f)) continue;
        if (files.length >= MAX_FILES) break;
        files.push(f);
        added++;
      }
      if (added === 0 && list?.length) {
        console.warn(`Only PDF files are allowed (max ${MAX_FILES}).`);
      }
      results = [];
      if (statsBox) statsBox.innerHTML = '';
      updatePill();
      renderList();
    }

    function removeAt(idx) {
      files.splice(idx, 1);
      results = [];
      if (statsBox) statsBox.innerHTML = '';
      updatePill();
      renderList();
    }

    /* ==================== Rendering: file list ==================== */
    function renderList() {
      if (!log) return;

      if (files.length === 0) {
        log.innerHTML = '<p class="subtle mini">No files yet. Add some PDFs to see predicted labels and the renamed output.</p>';
        return;
      }

      const rows = files.map((f, i) => `
        <div class="row">
          <span class="pill mini">${i + 1}</span>
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
          <button class="rm mini" data-idx="${i}" aria-label="Remove">Remove</button>
        </div>
      `).join('');

      log.innerHTML = rows;

      log.querySelectorAll('.rm').forEach(btn => {
        btn.addEventListener('click', e => removeAt(parseInt(e.currentTarget.dataset.idx, 10)));
      });
    }

    /* Row template (used by results renderers) */
    const rowHtml = (r, i) => `
      <div class="row">
        <span class="pill mini">${i + 1}</span>
        <div style="min-width:0">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}</div>
          <div class="subtle mini" style="margin-top:.15rem">
            → <code class="kbd">${r.newName}</code> in <code class="kbd">${r.folder}</code>
          </div>
        </div>
        <div style="text-align:right">
          <div class="label-badge label-${r.label}">${r.label}</div>
          <div class="mini subtle">conf: ${r.confidence}</div>
        </div>
      </div>`;

    /* ==================== Rendering: results (list) ==================== */
    function renderResultsList() {
      if (!log) return;
      const rows = results.map(rowHtml).join('');
      log.innerHTML = rows || '<p class="subtle mini">Run the demo to see results.</p>';
    }

    /* ==================== Rendering: results (folders) ==================== */
    function renderResultsFolders() {
      if (!log) return;

      if (results.length === 0) {
        log.innerHTML = '<p class="subtle mini">Run the demo to see results.</p>';
        return;
      }

      const groups = { invoice: [], contract: [], cv: [], unknown: [] };
      results.forEach(r => groups[r.label].push(r));

      const block = Object.entries(groups).map(([label, arr]) => {
        if (!arr.length) return '';
        const inner = arr.map((r, i) => rowHtml(r, i + 1)).join('');
        return `
          <div style="margin-bottom:1rem">
            <div class="folderbox">
              <code>output/classified/<strong>${label}</strong>/</code>
              <span class="mini subtle">${plural(arr.length, 'file')}</span>
            </div>
            <div style="margin-top:.5rem">${inner}</div>
          </div>`;
      }).join('');

      log.innerHTML = block;
    }

    /* Toggle renderer based on viewMode */
    function render() {
      (viewMode === 'folders') ? renderResultsFolders() : renderResultsList();
    }

    /* ==================== Stats chips ==================== */
    function renderStats() {
      if (!statsBox) return;
      if (!results.length) { statsBox.innerHTML = ''; return; }

      const counts = { invoice: 0, contract: 0, cv: 0, unknown: 0 };
      results.forEach(r => counts[r.label]++);

      statsBox.innerHTML = `
        <span class="stats-chip"><i class="i-invoice"></i>invoice <strong>${counts.invoice}</strong></span>
        <span class="stats-chip"><i class="i-contract"></i>contract <strong>${counts.contract}</strong></span>
        <span class="stats-chip"><i class="i-cv"></i>cv <strong>${counts.cv}</strong></span>
        <span class="stats-chip"><i class="i-unknown"></i>unknown <strong>${counts.unknown}</strong></span>
      `;
    }

    /* ==================== Demo: classify ==================== */
    function classify() {
      if (files.length === 0) {
        log.innerHTML = '<p class="mini warn">Add at least one PDF.</p>';
        return;
      }

      const prev = btnClassify.textContent;
      btnClassify.disabled = true;
      btnClassify.innerHTML = '<span class="loader"></span>Running…';

      // Simulated async classification
      setTimeout(() => {
        results = files.map(f => {
          const name = f.name.toLowerCase();
          let label = 'unknown';

          if (/invoice|factura|bill|receipt/.test(name)) label = 'invoice';
          else if (/contract|agreement|nda/.test(name)) label = 'contract';
          else if (/cv|resume|curriculum/.test(name)) label = 'cv';
          else label = LABELS[Math.floor(Math.random() * LABELS.length)];

          const confidence = (0.62 + Math.random() * 0.33).toFixed(2);
          const newName = `${label}__ai__${f.name}`;
          const folder = `output/classified/${label}/`;

          return { name: f.name, label, confidence, newName, folder };
        });

        render();
        renderStats();

        btnClassify.disabled = false;
        btnClassify.textContent = prev;

        log.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }

    /* ==================== Export: CSV ==================== */
    function exportCSV() {
      const header = ['original_name', 'new_name', 'type', 'used_gpt'];

      const data = (results.length
        ? results.map(r => [r.name, r.newName, r.label, 'true'])
        : files.map(f => [f.name, '', '', 'false'])
      );

      if (!data.length) return;

      const csv = header.join(',') + '\n' + data
        .map(row => row.map(v => `"${clip(v)}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'summary.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    /* ==================== Samples loader ==================== */
    function loadSamples() {
      const sampleNames = [
        'invoice_0423_acme.pdf', 'contract_service_2025_renewal.pdf',
        'oriol_martinez_CV.pdf', 'nda_partner_alpha.pdf',
        'invoice_2025-01_globex.pdf', 'random_scanned_doc.pdf'
      ];

      files = sampleNames.map(n => ({ name: n, type: 'application/pdf' }));
      results = [];
      if (statsBox) statsBox.innerHTML = '';
      updatePill();
      renderList();
    }

    /* ==================== Events ==================== */
    // Drag & drop
    drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop?.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop?.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      addFiles(e.dataTransfer.files);
    });
    drop?.addEventListener('click', () => input?.click());

    // File input
    input?.addEventListener('change', (e) => addFiles(e.target.files));

    // Actions
    btnClassify?.addEventListener('click', classify);
    btnClear?.addEventListener('click', () => {
      files = [];
      results = [];
      if (input) input.value = '';
      updatePill();
      renderList();
      if (statsBox) statsBox.innerHTML = '';
    });
    btnSamples?.addEventListener('click', loadSamples);
    btnExport?.addEventListener('click', exportCSV);

    // View toggles
    btnList?.addEventListener('click', () => {
      viewMode = 'list';
      btnList.setAttribute('aria-pressed', 'true');
      btnFolders?.setAttribute('aria-pressed', 'false');
      render();
    });

    btnFolders?.addEventListener('click', () => {
      viewMode = 'folders';
      btnFolders.setAttribute('aria-pressed', 'true');
      btnList?.setAttribute('aria-pressed', 'false');
      render();
    });

    // Copy code block
    copySetup?.addEventListener('click', async () => {
      if (!setupBlock) return;
      const text = setupBlock.innerText.replace(/\u00A0/g, ' ');
      try {
        await navigator.clipboard.writeText(text);
        copySetup.textContent = 'Copied ✓';
        setTimeout(() => (copySetup.textContent = 'Copy'), 1200);
      } catch {
        copySetup.textContent = 'Copy failed';
        setTimeout(() => (copySetup.textContent = 'Copy'), 1200);
      }
    });

    /* ==================== Initial render ==================== */
    show('Demo ready ✓');
    updatePill();
    renderList();
  }

  // DOM ready bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
