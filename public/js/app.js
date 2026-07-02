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
    if (!user) { window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname === '/' ? '/reports.html' : window.location.pathname + window.location.search); return null; }
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
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value);
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
    ];
    if (user && user.role !== 'mea_sales') {
      navItems.push({ href: '/reports.html', key: 'nav.reports', id: 'reports' });
    }
    if (user && user.role === 'admin') {
      navItems.push({ href: '/admin-settings.html', key: 'nav.settings', id: 'settings' });
    }
    navItems.push({ href: '/profile.html', key: 'nav.profile', id: 'profile' });

    const navHtml = navItems.map((item) => `
      <a href="${item.href}" data-i18n="${item.key}" class="${item.id === activePage ? 'active' : ''}"></a>
    `).join('');

    header.innerHTML = `
      <button class="hamburger-btn" id="hamburger-btn" style="display:none;">&#9776;</button>
      <a href="/dashboard.html" class="logo"><img src="/img/minib-logo-claim-EN-nahled.jpg" alt="MINIB" style="height:36px;"></a>
      <nav class="app-nav" id="app-nav">${navHtml}</nav>
      <div class="header-right">
        <div class="lang-switch">
          <button data-lang="cs">CS</button>
          <button data-lang="en">EN</button>
        </div>
        <button class="btn btn-secondary" id="logout-btn" data-i18n="nav.logout"></button>
      </div>
    `;

    document.getElementById('hamburger-btn').addEventListener('click', () => {
      document.getElementById('app-nav').classList.toggle('open');
    });
    document.getElementById('app-nav').querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => document.getElementById('app-nav').classList.remove('open'));
    });

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

  function defaultLandingPage(role) {
    return role === 'mea_sales' ? '/dashboard.html' : '/reports.html';
  }

  function lastPageKey(userId) {
    return `minib_last_page_${userId}`;
  }

  function getLastPage(userId) {
    return localStorage.getItem(lastPageKey(userId));
  }

  function setLastPage(userId, path) {
    localStorage.setItem(lastPageKey(userId), path);
  }

  // Generic "home"-style pages with no identifying query string. Deep links
  // (e.g. project-detail.html?id=42) are never auto-redirected away from —
  // only these generic entry points are, so a shared link always works.
  const GENERIC_PAGES = ['/dashboard.html', '/reports.html', '/project-new.html', '/profile.html', '/admin-settings.html', '/'];

  function isGenericEntryPage() {
    return GENERIC_PAGES.includes(window.location.pathname) && !window.location.search;
  }

  async function init(activePage, opts = {}) {
    const user = await requireAuth();
    if (!user) return null;

    const currentPath = window.location.pathname + window.location.search;
    const cameFromInApp = document.referrer && document.referrer.startsWith(window.location.origin);
    if (!cameFromInApp && isGenericEntryPage()) {
      const last = getLastPage(user.id);
      if (last && last !== currentPath) {
        window.location.replace(last);
        return null;
      }
    }
    setLastPage(user.id, currentPath);

    await I18N.load(I18N.getLang() || user.preferred_language || 'cs');
    await renderHeader(activePage);
    I18N.applyTranslations(document);
    return user;
  }

  const scrollKey = 'scroll_' + location.pathname + location.search;
  window.addEventListener('scroll', () => {
    sessionStorage.setItem(scrollKey, String(window.scrollY));
  });
  function restoreScroll() {
    const y = sessionStorage.getItem(scrollKey);
    if (y) window.scrollTo(0, parseInt(y, 10));
  }

  return {
    api, loadUser, getUser, requireAuth, requireHQ, renderHeader, init,
    statusBadgeClass, winBadgeClass, gaugeClass, fmtMoney, fmtDateTime, initials, restoreScroll,
    defaultLandingPage, getLastPage, setLastPage,
  };
})();
