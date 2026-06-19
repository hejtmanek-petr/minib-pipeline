// Shared application bootstrap: API helper, header/nav, auth guard

const App = (() => {
  let currentUser = null;

  async function api(path, options = {}) {
    const opts = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (options.body !== undefined) opts.body = JSON.stringify(options.body);

    const res = await fetch(`/api${path}`, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      const error = new Error((data && data.error) || `Request failed: ${res.status}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function loadUser() {
    try {
      const { user } = await api('/auth/me');
      currentUser = user;
      return user;
    } catch (e) {
      currentUser = null;
      return null;
    }
  }

  function getUser() { return currentUser; }

  async function requireAuth() {
    const user = await loadUser();
    if (!user) { window.location.href = '/login.html'; return null; }
    return user;
  }

  async function requireHQ() {
    return await requireAuth();
  }

  function statusBadgeClass(status) {
    return `badge badge-status-${status || 'lead'}`;
  }

  function winBadgeClass(pct) {
    if (pct === null || pct === undefined) return 'badge';
    if (pct < 30) return 'badge badge-win-low';
    if (pct <= 60) return 'badge badge-win-mid';
    return 'badge badge-win-high';
  }

  function gaugeClass(pct) {
    if (pct === null || pct === undefined) return 'low';
    if (pct < 30) return 'low';
    if (pct <= 60) return 'mid';
    return 'high';
  }

  function fmtMoney(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  }

  function fmtDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  async function renderHeader(activePage) {
    const user = currentUser || await loadUser();
    const header = document.getElementById('app-header');
    if (!header) return;

    const navItems = [
      { href: '/dashboard.html', key: 'nav.dashboard', id: 'dashboard' },
      { href: '/project-new.html', key: 'nav.newProject', id: 'new-project' },
      { href: '/reports.html', key: 'nav.reports', id: 'reports' },
    ];
    if (user && user.role === 'HQ') {
      navItems.push({ href: '/admin-settings.html', key: 'nav.settings', id: 'settings' });
    }
    navItems.push({ href: '/profile.html', key: 'nav.profile', id: 'profile' });

    const navHtml = navItems.map((item) => `
      <a href="${item.href}" data-i18n="${item.key}" class="${item.id === activePage ? 'active' : ''}"></a>
    `).join('');

    header.innerHTML = `
      <div class="logo"><span>MINIB</span><span class="dot">.</span></div>
      <nav class="app-nav">${navHtml}</nav>
      <div class="header-right">
        <div class="lang-switch">
          <button data-lang="cs">CS</button>
          <button data-lang="en">EN</button>
        </div>
        <button class="btn btn-secondary" id="logout-btn" data-i18n="nav.logout"></button>
      </div>
    `;

    I18N.applyTranslations(header);

    const lang = I18N.getLang();
    header.querySelectorAll('.lang-switch button').forEach((btn) => {
      if (btn.dataset.lang === lang) btn.classList.add('active');
      btn.addEventListener('click', async () => {
        await I18N.load(btn.dataset.lang);
        try { await api('/auth/preferred-language', { method: 'POST', body: { language: btn.dataset.lang } }); } catch (e) { /* ignore */ }
        window.location.reload();
      });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }

  async function init(activePage, opts = {}) {
    const user = await requireAuth();
    if (!user) return null;
    await I18N.load(I18N.getLang() || user.preferred_language || 'cs');
    await renderHeader(activePage);
    I18N.applyTranslations(document);
    return user;
  }

  return {
    api, loadUser, getUser, requireAuth, requireHQ, renderHeader, init,
    statusBadgeClass, winBadgeClass, gaugeClass, fmtMoney, fmtDateTime, initials,
  };
})();
