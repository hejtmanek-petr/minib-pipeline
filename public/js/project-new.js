(async () => {
  const user = await App.init('new-project');
  if (!user) return;

  const meta = await App.api('/projects/meta');

  const COUNTRY_NAMES = {
    cs: { 'TR':'Turecko','AZ':'Ázerbájdžán','Az':'Ázerbájdžán','GE':'Gruzie','KZ':'Kazachstán','UZ':'Uzbekistán','Mong':'Mongolsko','CAN':'Kanada','CZ':'Česko','SK':'Slovensko','Německo':'Německo','Slovinsko':'Slovinsko','Srbsko':'Srbsko','Itálie':'Itálie','Rakousko':'Rakousko','Rumunsko':'Rumunsko','Francie':'Francie','USA':'USA','Řecko':'Řecko','Portugalsko':'Portugalsko','Kanada':'Kanada','Arménie':'Arménie' },
    en: { 'TR':'Turkey','AZ':'Azerbaijan','Az':'Azerbaijan','GE':'Georgia','KZ':'Kazakhstan','UZ':'Uzbekistan','Mong':'Mongolia','CAN':'Canada','CZ':'Czech Republic','SK':'Slovakia','Německo':'Germany','Slovinsko':'Slovenia','Srbsko':'Serbia','Itálie':'Italy','Rakousko':'Austria','Rumunsko':'Romania','Francie':'France','USA':'USA','Řecko':'Greece','Portugalsko':'Portugal','Kanada':'Canada','Arménie':'Armenia' },
  };
  function countryLabel(code) {
    const map = COUNTRY_NAMES[I18N.getLang()] || COUNTRY_NAMES.cs;
    return map[code] || code || '';
  }

  function fillSelect(id, options, labelFn) {
    const sel = document.getElementById(id);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '-';
    sel.appendChild(empty);
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = labelFn ? labelFn(opt) : opt;
      sel.appendChild(o);
    });
  }

  fillSelect('f-country', meta.countries || [], countryLabel);
  fillSelect('f-building_type', meta.building_types || []);
  fillSelect('f-owner', meta.owners || []);
  fillSelect('f-status', meta.statuses || [], (v) => I18N.t('status.' + v));
  fillSelect('f-phase', meta.phases || [], (v) => I18N.t('phase.' + v));

  // Month/year dropdowns
  function buildMonthDropdown(wrapperId) {
    const wrap = document.getElementById(wrapperId);
    const currentYear = new Date().getFullYear();
    const monthNames = {
      cs: ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
      en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    };
    const names = monthNames[I18N.getLang()] || monthNames.cs;

    const selYear = document.createElement('select');
    const selMonth = document.createElement('select');

    const emptyOpt = (s, t) => { const o = document.createElement('option'); o.value = ''; o.textContent = t; s.appendChild(o); };
    emptyOpt(selYear, 'Rok');
    emptyOpt(selMonth, 'Měsíc');

    for (let y = 2026; y <= currentYear + 5; y++) {
      const o = document.createElement('option'); o.value = y; o.textContent = y; selYear.appendChild(o);
    }
    ['01','02','03','04','05','06','07','08','09','10','11','12'].forEach((m, i) => {
      const o = document.createElement('option'); o.value = m; o.textContent = names[i]; selMonth.appendChild(o);
    });

    wrap.appendChild(selYear);
    wrap.appendChild(selMonth);
    return { getValue: () => selYear.value && selMonth.value ? `${selYear.value}-${selMonth.value}` : null };
  }

  const decisionDate = buildMonthDropdown('f-decision-wrap');
  const deliveryDate = buildMonthDropdown('f-delivery-wrap');

  function parseNum(id) {
    const v = document.getElementById(id).value.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  document.getElementById('btn-create').addEventListener('click', async () => {
    const body = {
      country: document.getElementById('f-country').value || null,
      project_name: document.getElementById('f-project_name').value || null,
      company: document.getElementById('f-company').value || null,
      investor: document.getElementById('f-investor').value || null,
      client_name: document.getElementById('f-client_name').value || null,
      general_contractor: document.getElementById('f-general_contractor').value || null,
      installation_company: document.getElementById('f-installation_company').value || null,
      building_type: document.getElementById('f-building_type').value || null,
      owner: document.getElementById('f-owner').value || null,
      status: document.getElementById('f-status').value || 'lead',
      phase: document.getElementById('f-phase').value || null,
      estimated_decision_date: decisionDate.getValue(),
      estimated_delivery_date: deliveryDate.getValue(),
      products_and_quantity: document.getElementById('f-products_and_quantity').value || null,
      competition: document.getElementById('f-competition').value || null,
      current_status_note: document.getElementById('f-current_status_note').value || null,
      project_value_eur: parseNum('f-project_value_eur'),
      project_value_local: parseNum('f-project_value_local'),
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
