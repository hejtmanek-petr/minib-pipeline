(async () => {
  const user = await App.init('new-project');
  if (!user) return;

  const meta = await App.api('/projects/meta');

  function fillSelect(id, options, i18nPrefix) {
    const sel = document.getElementById(id);
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = i18nPrefix ? I18N.t(`${i18nPrefix}.${opt}`) : opt;
      sel.appendChild(o);
    });
  }

  fillSelect('f-country', meta.countries || []);
  fillSelect('f-building_type', meta.building_types || []);
  fillSelect('f-status', meta.statuses || [], 'status');
  fillSelect('f-phase', meta.phases || [], 'phase');

  const ownersList = document.getElementById('owners-list');
  (meta.owners || []).forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    ownersList.appendChild(opt);
  });

  document.getElementById('new-project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      sheet: document.getElementById('f-sheet').value,
      country: document.getElementById('f-country').value,
      project_name: document.getElementById('f-project_name').value,
      company: document.getElementById('f-company').value,
      client_name: document.getElementById('f-client_name').value,
      building_type: document.getElementById('f-building_type').value,
      owner: document.getElementById('f-owner').value,
      status: document.getElementById('f-status').value,
      phase: document.getElementById('f-phase').value,
      minib_price_eur: document.getElementById('f-minib_price_eur').value || null,
      estimated_decision_date: document.getElementById('f-estimated_decision_date').value,
      estimated_delivery_date: document.getElementById('f-estimated_delivery_date').value,
      products_and_quantity: document.getElementById('f-products_and_quantity').value,
      competition: document.getElementById('f-competition').value,
      current_status_note: document.getElementById('f-current_status_note').value,
    };
    const res = await App.api('/projects', { method: 'POST', body });
    window.location.href = `/project-detail.html?id=${res.project.id}`;
  });

  // --- Import ---
  const modal = document.getElementById('import-modal');
  document.getElementById('import-btn').addEventListener('click', () => { modal.style.display = 'flex'; });
  document.getElementById('close-import').addEventListener('click', () => { modal.style.display = 'none'; });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const base64 = btoa(new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ''));

    const res = await App.api('/projects/import/preview', { method: 'POST', body: { fileBase64: base64 } });
    renderPreview(res.sheets);
  });

  function renderPreview(sheets) {
    const container = document.getElementById('import-preview');
    container.innerHTML = '';

    Object.keys(sheets).forEach((sheetName) => {
      const rows = sheets[sheetName];
      if (!rows.length) return;

      const wrap = document.createElement('div');
      wrap.style.marginTop = '16px';

      const heading = document.createElement('h3');
      heading.textContent = `${sheetName} (${rows.length}) - ${I18N.t('newProject.selectRows')}`;
      wrap.appendChild(heading);

      const cols = Object.keys(rows[0]);
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      tableWrap.style.maxHeight = '300px';
      tableWrap.style.overflow = 'auto';

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr><th></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const checkboxTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.idx = idx;
        checkboxTd.appendChild(checkbox);
        tr.appendChild(checkboxTd);
        cols.forEach((c) => {
          const td = document.createElement('td');
          td.textContent = row[c] === null || row[c] === undefined ? '' : row[c];
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      wrap.appendChild(tableWrap);

      const importBtn = document.createElement('button');
      importBtn.className = 'btn btn-primary';
      importBtn.textContent = I18N.t('newProject.confirmImport');
      importBtn.style.marginTop = '10px';
      importBtn.addEventListener('click', async () => {
        const selectedRows = [];
        tbody.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
          selectedRows.push(rows[parseInt(cb.dataset.idx, 10)]);
        });
        const result = await App.api('/projects/import/commit', { method: 'POST', body: { rows: selectedRows, sheet: sheetName } });
        alert(`${result.inserted} projects imported`);
        modal.style.display = 'none';
        window.location.href = '/dashboard.html';
      });
      wrap.appendChild(importBtn);

      container.appendChild(wrap);
    });
  }
})();
