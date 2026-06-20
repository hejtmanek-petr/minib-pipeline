(async () => {
  const user = await App.init('project-detail');
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  if (!projectId) {
    window.location.href = '/dashboard.html';
    return;
  }

  let project = null;
  let meta = null;

  const COUNTRY_NAMES = {
    cs: { 'TR':'Turecko','AZ':'Ázerbájdžán','Az':'Ázerbájdžán','GE':'Gruzie','KZ':'Kazachstán','UZ':'Uzbekistán','Mong':'Mongolsko','CAN':'Kanada','CZ':'Česko','SK':'Slovensko','Německo':'Německo','Slovinsko':'Slovinsko','Srbsko':'Srbsko','Itálie':'Itálie','Rakousko':'Rakousko','Rumunsko':'Rumunsko','Francie':'Francie','USA':'USA','Řecko':'Řecko','Portugalsko':'Portugalsko','Kanada':'Kanada','Arménie':'Arménie' },
    en: { 'TR':'Turkey','AZ':'Azerbaijan','Az':'Azerbaijan','GE':'Georgia','KZ':'Kazakhstan','UZ':'Uzbekistan','Mong':'Mongolia','CAN':'Canada','CZ':'Czech Republic','SK':'Slovakia','Německo':'Germany','Slovinsko':'Slovenia','Srbsko':'Serbia','Itálie':'Italy','Rakousko':'Austria','Rumunsko':'Romania','Francie':'France','USA':'USA','Řecko':'Greece','Portugalsko':'Portugal','Kanada':'Canada','Arménie':'Armenia' },
  };
  function countryLabel(code) {
    const map = COUNTRY_NAMES[I18N.getLang()] || COUNTRY_NAMES.cs;
    return map[code] || code || '';
  }

  const BASIC_FIELDS = [
    { field: 'project_code', type: 'text', readonly: true },
    { field: 'country', type: 'select', options: () => meta.countries || [], labelFn: countryLabel },
    { field: 'project_name', type: 'text' },
    { field: 'company', type: 'text' },
    { field: 'investor', type: 'text' },
    { field: 'client_name', type: 'text' },
    { field: 'general_contractor', type: 'text' },
    { field: 'installation_company', type: 'text' },
    { field: 'building_type', type: 'select', options: () => meta.building_types || [] },
    { field: 'owner', type: 'select', options: () => meta.owners || [] },
    { field: 'status', type: 'select', options: () => meta.statuses || [], i18nPrefix: 'status' },
    { field: 'phase', type: 'select', options: () => meta.phases || [], i18nPrefix: 'phase' },
    { field: 'products_and_quantity', type: 'textarea' },
    { field: 'competition', type: 'text' },
    { field: 'estimated_decision_date', type: 'month' },
    { field: 'estimated_delivery_date', type: 'month' },
    { field: 'current_status_note', type: 'textarea' },
  ];

  const COMMERCIAL_FIELDS = [
    { field: 'project_value_eur', type: 'number', suffix: '€' },
    { field: 'project_value_local', type: 'number', suffix: 'Kč' },
  ];

  function fieldLabel(field) {
    return I18N.t(`project.field.${field}`);
  }

  function displayValue(field, value) {
    if (value === null || value === undefined || value === '') return null;
    if (field === 'status') return I18N.t('status.' + value);
    if (field === 'phase') return I18N.t('phase.' + value);
    if (field.endsWith('_eur') || field.endsWith('_local')) return App.fmtMoney(value);
    return value;
  }

  function castFieldValue(field, value) {
    if (['minib_price_eur', 'project_value_eur', 'project_value_local', 'exchange_rate'].includes(field)) {
      return value === '' ? null : parseFloat(value);
    }
    return value === '' ? null : value;
  }

  function showSaved(btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ ' + I18N.t('common.saved');
    btn.style.background = '#2E7D32';
    btn.style.color = '#fff';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
      btn.style.color = '';
      btn.disabled = false;
    }, 2000);
  }

  async function saveFields(fields) {
    const body = {};
    fields.forEach(({ field, value }) => {
      body[field] = castFieldValue(field, value);
    });
    const res = await App.api(`/projects/${projectId}`, { method: 'PUT', body });
    project = res.project;
    return project;
  }

  // Builds a label + always-editable input/select/textarea for a field.
  // Returns { wrap, getValue } so the containing block's Save button can collect values.
  function buildField(config) {
    const wrap = document.createElement('div');
    wrap.className = 'field-item';

    const label = document.createElement('label');
    label.textContent = fieldLabel(config.field);
    wrap.appendChild(label);

    const raw = project[config.field];

    if (config.readonly) {
      const valueEl = document.createElement('div');
      valueEl.className = 'editable-value';
      const display = displayValue(config.field, raw);
      valueEl.textContent = display === null ? '-' : display;
      if (display === null) valueEl.classList.add('empty');
      wrap.appendChild(valueEl);
      return { wrap, getValue: () => raw };
    }

    let input;
    if (config.type === 'select') {
      input = document.createElement('select');
      const options = config.options();
      options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = config.labelFn ? config.labelFn(opt) : config.i18nPrefix ? I18N.t(`${config.i18nPrefix}.${opt}`) : (I18N.t(`owner.${opt}`) !== `owner.${opt}` ? I18N.t(`owner.${opt}`) : opt);
        if (opt === raw) o.selected = true;
        input.appendChild(o);
      });
    } else if (config.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.value = raw || '';
    } else if (config.type === 'number') {
      input = document.createElement('input');
      input.type = 'text';
      const fmt = (v) => v !== '' && v !== null && v !== undefined
        ? Number(v).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) : '';
      const unFmt = (v) => v.replace(/\s/g, '').replace(',', '.');
      input.value = fmt(raw);
      input.addEventListener('focus', () => { input.value = raw === null || raw === undefined ? '' : raw; });
      input.addEventListener('blur', () => { const n = parseFloat(unFmt(input.value)); input.value = isNaN(n) ? '' : fmt(n); raw = isNaN(n) ? null : n; });
    } else if (config.type === 'month') {
      const currentYear = new Date().getFullYear();
      const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
      const monthNames = { cs: ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
                           en: ['January','February','March','April','May','June','July','August','September','October','November','December'] };

      const selYear = document.createElement('select');
      const selMonth = document.createElement('select');

      const emptyOpt = (sel) => { const o = document.createElement('option'); o.value = ''; o.textContent = '-'; sel.appendChild(o); };
      emptyOpt(selYear); emptyOpt(selMonth);

      for (let y = 2026; y <= currentYear + 5; y++) {
        const o = document.createElement('option'); o.value = y; o.textContent = y; selYear.appendChild(o);
      }
      const names = monthNames[I18N.getLang()] || monthNames.cs;
      months.forEach((m, i) => { const o = document.createElement('option'); o.value = m; o.textContent = names[i]; selMonth.appendChild(o); });

      if (raw) {
        const parts = String(raw).slice(0, 7).split('-');
        selYear.value = parts[0] || '';
        selMonth.value = parts[1] || '';
      }

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;';
      row.appendChild(selYear);
      row.appendChild(selMonth);
      wrap.appendChild(row);
      return { wrap, field: config.field, getValue: () => {
        if (!selYear.value || !selMonth.value) return null;
        return `${selYear.value}-${selMonth.value}`;
      }};
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = raw === null || raw === undefined ? '' : raw;
    }

    if (config.suffix) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';
      row.appendChild(input);
      const sfx = document.createElement('span');
      sfx.textContent = config.suffix;
      sfx.style.cssText = 'font-weight:600;color:var(--color-text-muted);white-space:nowrap;';
      row.appendChild(sfx);
      wrap.appendChild(row);
    } else {
      wrap.appendChild(input);
    }
    return { wrap, getValue: () => {
      if (config.type === 'number') {
        const v = input.value.replace(/\s/g, '').replace(',', '.');
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      }
      return input.value;
    }, field: config.field };
  }

  let basicFieldHandles = [];
  let commercialFieldHandles = [];

  function renderBasicFields() {
    const container = document.getElementById('basic-fields');
    container.innerHTML = '';
    basicFieldHandles = BASIC_FIELDS.map((cfg) => {
      const handle = buildField(cfg);
      container.appendChild(handle.wrap);
      return handle;
    });
  }

  function renderCommercialFields() {
    const container = document.getElementById('commercial-fields');
    container.innerHTML = '';
    commercialFieldHandles = COMMERCIAL_FIELDS.map((cfg) => {
      const handle = buildField(cfg);
      container.appendChild(handle.wrap);
      return handle;
    });
  }

  document.getElementById('save-basic-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const fields = basicFieldHandles
      .filter((h) => h.field)
      .map((h) => ({ field: h.field, value: h.getValue() }));
    await saveFields(fields);
    showSaved(btn);
    renderBasicFields();
    await loadHistory();
  });

  document.getElementById('save-commercial-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const fields = commercialFieldHandles
      .filter((h) => h.field)
      .map((h) => ({ field: h.field, value: h.getValue() }));
    await saveFields(fields);
    showSaved(btn);
    renderCommercialFields();
    await loadHistory();
  });

  function renderGauges() {
    const manualMin = project.win_prob_manual_min;
    const manualMax = project.win_prob_manual_max;
    const manualVal = manualMin !== null && manualMin !== undefined ? manualMin : null;

    const manualFill = document.getElementById('manual-gauge-fill');
    const manualValueEl = document.getElementById('manual-gauge-value');
    if (manualVal !== null) {
      manualFill.style.width = `${manualVal}%`;
      manualFill.className = `gauge-fill ${App.gaugeClass(manualVal)}`;
      manualValueEl.textContent = manualMin === manualMax || manualMax === null || manualMax === undefined
        ? `${manualMin}%`
        : `${manualMin}% - ${manualMax}%`;
    } else {
      manualFill.style.width = '0%';
      manualValueEl.textContent = '-';
    }

    const sliderEl = document.getElementById('manual-prob');
    const displayEl = document.getElementById('manual-prob-display');
    if (manualVal !== null) {
      sliderEl.value = manualVal;
      displayEl.textContent = manualVal + '%';
    } else {
      sliderEl.value = 0;
      displayEl.textContent = '-';
    }

    const ai = project.win_prob_ai;
    const aiFill = document.getElementById('ai-gauge-fill');
    const aiValueEl = document.getElementById('ai-gauge-value');
    if (ai !== null && ai !== undefined) {
      aiFill.style.width = `${ai}%`;
      aiFill.className = `gauge-fill ${App.gaugeClass(ai)}`;
      const min = project.win_prob_ai_min;
      const max = project.win_prob_ai_max;
      aiValueEl.textContent = (min !== null && max !== null && (min !== ai || max !== ai))
        ? `${ai}% (${min}% - ${max}%)`
        : `${ai}%`;
    } else {
      aiFill.style.width = '0%';
      aiValueEl.textContent = '-';
    }

    const updatedEl = document.getElementById('ai-updated');
    if (project.win_prob_ai_updated_at) {
      updatedEl.textContent = `${I18N.t('winprob.lastUpdated')}: ${App.fmtDateTime(project.win_prob_ai_updated_at)}`;
    } else {
      updatedEl.textContent = I18N.t('winprob.noAssessment');
    }

    const reasoningEl = document.getElementById('ai-reasoning');
    if (project.win_prob_ai_reasoning) {
      reasoningEl.style.display = 'block';
      reasoningEl.innerHTML = `<strong>${I18N.t('winprob.aiReasoning')}:</strong> ${project.win_prob_ai_reasoning}`;
    } else {
      reasoningEl.style.display = 'none';
    }
  }

  document.getElementById('manual-prob').addEventListener('input', () => {
    const v = document.getElementById('manual-prob').value;
    document.getElementById('manual-prob-display').textContent = v + '%';
    const fill = document.getElementById('manual-gauge-fill');
    fill.style.width = `${v}%`;
    fill.className = `gauge-fill ${App.gaugeClass(parseInt(v, 10))}`;
    document.getElementById('manual-gauge-value').textContent = v + '%';
  });

  document.getElementById('save-manual-prob').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const prob = document.getElementById('manual-prob').value;
    const value = prob === '' ? null : parseInt(prob, 10);
    await App.api(`/projects/${projectId}`, {
      method: 'PUT',
      body: {
        win_prob_manual_min: value,
        win_prob_manual_max: value,
      },
    });
    const res = await App.api(`/projects/${projectId}`);
    project = res.project;
    renderGauges();
    showSaved(btn);
    await loadHistory();
  });

  document.getElementById('ask-ai-btn').addEventListener('click', async () => {
    const btn = document.getElementById('ask-ai-btn');
    const spinner = document.getElementById('ai-spinner');
    const updatedEl = document.getElementById('ai-updated');
    btn.disabled = true;
    spinner.style.display = 'block';
    updatedEl.classList.remove('error-message');
    try {
      const res = await App.api(`/projects/${projectId}/ai-assess`, {
        method: 'POST',
        body: { lang: I18N.getLang() },
      });
      project = res.project;
      renderGauges();
    } catch (err) {
      updatedEl.textContent = err.status === 503 ? I18N.t('winprob.aiUnavailable') : err.message;
      updatedEl.classList.add('error-message');
    } finally {
      btn.disabled = false;
      spinner.style.display = 'none';
    }
  });

  // --- AI Value estimate ---

  function renderAiValue(p) {
    const display = document.getElementById('ai-value-display');
    const breakdown = document.getElementById('ai-value-breakdown');
    if (!display) return;
    if (p.ai_value_eur != null) {
      display.textContent = Number(p.ai_value_eur).toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) + ' €';
      display.style.color = 'var(--primary)';
    } else {
      display.textContent = '—';
      display.style.color = '';
    }
    if (breakdown) breakdown.textContent = '';
  }

  document.getElementById('btn-estimate-value').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const display = document.getElementById('ai-value-display');
    const breakdown = document.getElementById('ai-value-breakdown');
    btn.disabled = true;
    btn.textContent = '⏳ Odhaduji...';
    display.textContent = '...';
    try {
      const res = await App.api(`/ai/estimate-value/${projectId}`, { method: 'POST' });
      if (res.estimated_value_eur != null) {
        project.ai_value_eur = res.estimated_value_eur;
        display.textContent = Number(res.estimated_value_eur).toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) + ' €';
        display.style.color = 'var(--primary)';
      } else {
        display.textContent = 'Nelze odhadnout';
        display.style.color = 'var(--text-muted)';
      }
      if (breakdown && res.breakdown) breakdown.textContent = res.breakdown;
    } catch (err) {
      display.textContent = 'Chyba: ' + err.message;
      display.style.color = 'red';
    } finally {
      btn.disabled = false;
      btn.textContent = '🤖 Odhadnout AI hodnotu';
    }
  });

  // --- Comments ---

  async function loadComments() {
    const res = await App.api(`/projects/${projectId}/comments`);
    const feed = document.getElementById('comment-feed');
    if (!res.comments.length) {
      feed.innerHTML = `<div class="text-muted">${I18N.t('common.noData')}</div>`;
      return;
    }
    feed.innerHTML = res.comments.map((c) => {
      const sourceBadge = c.source === 'voice'
        ? `<span class="badge badge-source">🎤 ${I18N.t('comments.sourceVoice')}</span>`
        : `<span class="badge badge-source">✍️ ${I18N.t('comments.sourceText')}</span>`;
      const langBadge = c.original_language
        ? `<span class="badge badge-lang">${c.original_language.toUpperCase()}</span>`
        : '';
      const canManage = c.user_id === user.id || user.role === 'HQ';
      const actions = canManage ? `
            <div class="comment-actions">
              <button class="btn-link edit-comment-btn" data-id="${c.id}">${I18N.t('common.edit')}</button>
              <button class="btn-link delete-comment-btn" data-id="${c.id}">${I18N.t('common.delete')}</button>
            </div>` : '';
      return `
        <div class="comment-item" data-comment-id="${c.id}">
          <div class="avatar">${App.initials(c.author_name)}</div>
          <div class="comment-body">
            <div class="comment-meta">
              <span class="author-name">${c.author_name}</span>
              <span>${App.fmtDateTime(c.created_at)}</span>
              ${sourceBadge}
              ${langBadge}
            </div>
            <div class="comment-text">${c.content.replace(/</g, '&lt;')}</div>
            ${actions}
          </div>
        </div>
      `;
    }).join('');

    feed.querySelectorAll('.delete-comment-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(I18N.t('comments.confirmDelete'))) return;
        await App.api(`/projects/${projectId}/comments/${btn.dataset.id}`, { method: 'DELETE' });
        await loadComments();
      });
    });

    feed.querySelectorAll('.edit-comment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = feed.querySelector(`.comment-item[data-comment-id="${btn.dataset.id}"]`);
        const textEl = item.querySelector('.comment-text');
        const currentText = textEl.textContent;

        const textarea = document.createElement('textarea');
        textarea.rows = 3;
        textarea.value = currentText;
        textarea.className = 'comment-edit-textarea';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary btn-sm';
        saveBtn.textContent = I18N.t('common.save');

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary btn-sm';
        cancelBtn.textContent = I18N.t('common.cancel');
        cancelBtn.style.marginLeft = '8px';

        const editWrap = document.createElement('div');
        editWrap.appendChild(textarea);
        const btnRow = document.createElement('div');
        btnRow.style.marginTop = '8px';
        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        editWrap.appendChild(btnRow);

        item.querySelector('.comment-actions').style.display = 'none';
        textEl.replaceWith(editWrap);

        saveBtn.addEventListener('click', async () => {
          const newContent = textarea.value.trim();
          if (!newContent) return;
          await App.api(`/projects/${projectId}/comments/${btn.dataset.id}`, { method: 'PUT', body: { content: newContent } });
          showSaved(saveBtn);
          setTimeout(() => loadComments(), 2000);
        });
        cancelBtn.addEventListener('click', () => {
          loadComments();
        });
      });
    });
  }

  document.getElementById('add-comment-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const textarea = document.getElementById('comment-text');
    const content = textarea.value.trim();
    if (!content) return;
    await App.api(`/projects/${projectId}/comments`, {
      method: 'POST',
      body: { content, source: 'text', original_language: I18N.getLang() },
    });
    textarea.value = '';
    showSaved(btn);
    await loadComments();
  });

  // --- Voice input ---

  let voiceLang = 'en';
  document.querySelectorAll('.voice-langs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.voice-langs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      voiceLang = btn.dataset.lang;
    });
  });

  if (!VoiceInput.isSupported) {
    document.getElementById('mic-btn').style.display = 'none';
    document.getElementById('voice-not-supported').style.display = 'block';
  } else {
    let rawTranscript = '';
    VoiceInput.init({
      onResult: (final, interim) => {
        document.getElementById('live-transcript').textContent = final + interim;
      },
      onEnd: async (finalText) => {
        const micBtn = document.getElementById('mic-btn');
        micBtn.classList.remove('recording');
        document.getElementById('voice-status').textContent = I18N.t('comments.startRecording');
        rawTranscript = finalText;
        if (!finalText) return;

        document.getElementById('voice-status').textContent = I18N.t('comments.correcting');
        let corrected = finalText;
        try {
          const res = await App.api('/ai/correct-transcript', { method: 'POST', body: { text: finalText, language: voiceLang } });
          corrected = res.corrected;
        } catch (err) {
          // graceful degradation - use raw transcript
        }
        document.getElementById('voice-status').textContent = I18N.t('comments.startRecording');
        document.getElementById('voice-transcript-text').value = corrected;
        document.getElementById('voice-result-area').style.display = 'block';
        document.getElementById('voice-result-area').dataset.raw = rawTranscript;
      },
      onError: () => {
        document.getElementById('mic-btn').classList.remove('recording');
        document.getElementById('voice-status').textContent = I18N.t('comments.startRecording');
      },
    });

    document.getElementById('mic-btn').addEventListener('click', () => {
      const micBtn = document.getElementById('mic-btn');
      if (VoiceInput.isRecording()) {
        VoiceInput.stop();
      } else {
        document.getElementById('live-transcript').textContent = '';
        document.getElementById('voice-result-area').style.display = 'none';
        micBtn.classList.add('recording');
        document.getElementById('voice-status').textContent = I18N.t('comments.recording');
        VoiceInput.start(voiceLang);
      }
    });

    document.getElementById('save-voice-comment').addEventListener('click', async () => {
      const content = document.getElementById('voice-transcript-text').value.trim();
      if (!content) return;
      const raw = document.getElementById('voice-result-area').dataset.raw || content;
      await App.api(`/projects/${projectId}/comments`, {
        method: 'POST',
        body: { content, source: 'voice', original_language: voiceLang, raw_transcript: raw },
      });
      document.getElementById('voice-result-area').style.display = 'none';
      document.getElementById('voice-transcript-text').value = '';
      document.getElementById('live-transcript').textContent = '';
      await loadComments();
    });
  }

  // --- History ---

  async function loadHistory() {
    const res = await App.api(`/projects/${projectId}/history`);
    const tbody = document.getElementById('history-tbody');
    if (!res.history.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">${I18N.t('common.noData')}</td></tr>`;
      return;
    }
    tbody.innerHTML = res.history.map((h) => `
      <tr>
        <td>${fieldLabel(h.field_name)}</td>
        <td>${h.old_value ?? '-'}</td>
        <td>${h.new_value ?? '-'}</td>
        <td>${h.user_name}</td>
        <td>${App.fmtDateTime(h.changed_at)}</td>
      </tr>
    `).join('');
  }

  // --- Init ---

  try {
    const [projectRes, metaRes] = await Promise.all([
      App.api(`/projects/${projectId}`),
      App.api('/projects/meta'),
    ]);
    project = projectRes.project;
    meta = metaRes;

    document.getElementById('project-title').textContent = `${project.project_code} - ${project.project_name || ''}`;
    const bc = document.getElementById('breadcrumb-project-name');
    if (bc) bc.textContent = project.project_name || project.project_code || '';

    renderBasicFields();
    renderCommercialFields();
    renderAiValue(project);
    renderGauges();

    const deleteBtn = document.getElementById('btn-delete-project');
    if (deleteBtn) {
      if (user.role !== 'HQ') {
        deleteBtn.style.display = 'none';
      } else {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(`Opravdu smazat projekt "${project.project_name || project.project_code}"? Tato akce je nevratná.`)) return;
          await App.api(`/projects/${projectId}`, { method: 'DELETE' });
          window.location.href = '/dashboard.html';
        });
      }
    }

    if (user.role !== 'HQ' && meta.dealer_visibility && meta.dealer_visibility.hide_hq_only_sections) {
      document.querySelectorAll('[data-visibility="hq-only"]').forEach((el) => el.classList.add('hidden-for-dealer'));
    }

    await Promise.all([loadComments(), loadHistory()]);
  } catch (err) {
    console.error(err);
    if (err.status === 404) window.location.href = '/dashboard.html';
  }
})();
