// Assets Application - Dynamic YAML loader and template renderer
(function() {
  // Canonical origin for this site. Change this ONE
  // line (and the <link rel="canonical"> / og:url tags in the HTML heads) if you
  // buy a domain or change the domain.
  const SITE_BASE = 'https://neuralbytea.github.io/neuralbyteai.github.io';

  // Everything below is interpolated into innerHTML. Escape it so an apostrophe
  // or ampersand in the YAML cannot break the markup.
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Optional list fields (README documents modules/tags as optional, but the
  // renderers used to assume they were always present and threw without them).
  function list(v) {
    return Array.isArray(v) ? v : [];
  }

  // Flag JS-on early so the scroll-reveal CSS only hides content when it can
  // actually be revealed again.
  document.documentElement.classList.add('js');

  // Fade elements in as they enter the viewport. Safe to call repeatedly after
  // each render; already-observed nodes are skipped.
  let revealObserver = null;
  function observeReveals() {
    const nodes = document.querySelectorAll('.reveal:not(.in):not([data-obs])');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(n => n.classList.add('in'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    nodes.forEach((n, i) => {
      n.setAttribute('data-obs', '1');
      if (!n.style.getPropertyValue('--d')) n.style.setProperty('--d', `${(i % 6) * 70}ms`);
      revealObserver.observe(n);
    });
  }

  // Count a stat like "250+" or "54k+" up from 0 once it is on screen. Values
  // without a leading number ("3 Dev + 1 Functional") are left untouched.
  function animateCounters() {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.stat-n[data-count]').forEach(el => {
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      if (reduce || isNaN(target) || !('IntersectionObserver' in window)) return;
      el.textContent = '0' + suffix;
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 1200;
        (function tick(now) {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        })(start);
      }, { threshold: 0.6 });
      io.observe(el);
    });
  }

  // Load js-yaml CDN library dynamically if needed
  function initYAML(callback) {
    if (typeof jsyaml !== 'undefined') {
      callback();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  }

  // Helper to fetch and parse yaml
  async function loadData() {
    try {
      const response = await fetch('portfolio_data.yaml');
      if (!response.ok) {
        throw new Error('Failed to load portfolio_data.yaml');
      }
      const yamlText = await response.text();
      return jsyaml.load(yamlText);
    } catch (e) {
      console.error('Error loading portfolio data:', e);
      return null;
    }
  }

  // Active page helpers
  function getActivePage() {
    const path = window.location.pathname;
    if (path.endsWith('/') || path === "") {
      return 'index.html';
    }
    return path.split('/').pop().toLowerCase();
  }

  // Set/replace a <meta> or <link> in <head> so JS-rendered pages still emit a
  // unique description and canonical per project (project.html is one template
  // serving 15 URLs; without this Google sees one page called "Project Details").
  function setMeta(selector, attr, value) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
      const m = selector.match(/\[(\w+)="([^"]+)"\]/);
      if (m) el.setAttribute(m[1], m[2]);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  }

  function getCategoryIcon(cat) {
    if (cat === 'odoo') return '⚙';
    if (cat === 'android') return '📱';
    return '🌐';
  }

  function getCategoryColorClass(cat) {
    if (cat === 'odoo') return 'blue';
    if (cat === 'android') return 'green';
    return 'purple';
  }

  // Render HTML Image element with auto placeholder fallback
  // Designed cover used whenever a project has no screenshot: the headline
  // metric (from `metric` / `metric_label` in the YAML) on a category gradient.
  function renderCover(project) {
    const version = project.odoo_version || (project.category === 'odoo' ? 'Odoo' : project.category);
    const body = project.metric
      ? `<div class="cover-metric">${esc(project.metric)}</div><div class="cover-label">${esc(project.metric_label || '')}</div>`
      : `<span class="cover-icon">${getCategoryIcon(project.category)}</span>`;
    return `<div class="cover ${esc(project.category)}"><span class="cover-ver">${esc(version)}</span>${body}</div>`;
  }

  function renderProjectImage(project, isDetail = false) {
    const fallbackHtml = renderCover(project);

    if (!project.image) {
      return fallbackHtml;
    }

    // Screenshot when the file exists, metric cover when it does not.
    return `
      <img src="${esc(project.image)}" alt="${esc(project.title)} — ${esc(project.category)} project screenshot" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
      <div style="display:none; width:100%; height:100%;">${fallbackHtml}</div>
    `;
  }

  function sortProjectsNewestFirst(projects) {
    return [...projects].sort((a, b) => {
      const yearDiff = Number(b.year || 0) - Number(a.year || 0);
      return yearDiff !== 0 ? yearDiff : 0;
    });
  }

  // App Initialization
  initYAML(async function() {
    const data = await loadData();
    if (!data) {
      // Do not wipe document.body — the hero, contact details and noscript
      // fallback are real content and should survive a failed data fetch
      // (e.g. cdnjs blocked by a corporate firewall). Prepend a notice instead.
      const banner = document.createElement('div');
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'background:#fdecec; color:#8a1c1c; text-align:center; padding:12px; font-size:13px;';
      banner.textContent = 'Some content could not be loaded. Email neuralbytea@gmail.com.';
      document.body.prepend(banner);
      return;
    }

    // Titles: every static page now carries a hand-written, keyword-bearing
    // <title> in its own <head>. Do NOT overwrite those here — doing so replaced
    // them with short generic ones in the rendered DOM, which is what Google and
    // the LinkedIn preview bot actually read. Only project.html needs a runtime
    // title, because one template serves every project.
    const pageName = getActivePage();
    let pageTitle = null;
    if (pageName === 'project.html') {
      const urlParams = new URLSearchParams(window.location.search);
      const projId = urlParams.get('id');
      const proj = data.projects.find(p => p.id === projId);
      if (proj) {
        const versionPart = proj.odoo_version ? ` — ${proj.odoo_version}` : '';
        pageTitle = `${proj.title}${versionPart} | ${data.site.name} · Odoo 18 app`;
        setMeta('meta[name="description"]', 'content', proj.short_desc || '');
        setMeta('link[rel="canonical"]', 'href', `${SITE_BASE}/project.html?id=${proj.id}`);
        setMeta('meta[property="og:title"]', 'content', pageTitle);
        setMeta('meta[property="og:description"]', 'content', proj.short_desc || '');
        setMeta('meta[property="og:url"]', 'content', `${SITE_BASE}/project.html?id=${proj.id}`);
        // Social crawlers (LinkedIn, X) ignore SVG, so keep the site-wide PNG
        // cover for those and only override with raster project images.
        if (proj.image && !/\.svg$/i.test(proj.image)) {
          setMeta('meta[property="og:image"]', 'content', `${SITE_BASE}/${proj.image}`);
          setMeta('meta[name="twitter:image"]', 'content', `${SITE_BASE}/${proj.image}`);
        }
      }
    }

    if (pageTitle) document.title = pageTitle;

    // Render Shared Navigation & Header Shell
    renderNavigation(data);
    renderFooter(data);

    // Page-specific routing logic
    if (pageName === 'index.html') {
      renderHomePage(data);
    } else if (pageName === 'apps.html') {
      renderOdooPage(data);
    } else if (pageName === 'project.html') {
      renderProjectDetailPage(data);
    } else if (pageName === 'contact.html') {
      renderContactPage(data);
    }

    renderHire(data);
    observeReveals();
    animateCounters();
  });

  // Render Header/Navbar
  function renderNavigation(data) {
    const navContainer = document.getElementById('nav-container');
    if (!navContainer) return;

    const page = getActivePage();
    const isAvail = data.site.available_for_work;
    
    navContainer.innerHTML = `
      <div class="nav">
        <a href="index.html" class="nav-logo"><img class="logo-img" src="assets/images/mark-512.png" alt="" width="28" height="28">${esc(data.site.name)}</a>
        <button class="nav-toggle" type="button" aria-label="Toggle menu" aria-expanded="false">☰</button>
        <div class="nav-links">
          <a href="index.html" class="${page === 'index.html' ? 'active' : ''}">Home</a>
          <a href="apps.html" class="${page === 'apps.html' || page === 'project.html' ? 'active' : ''}">Apps</a>
          <a href="${esc(data.site.store)}" target="_blank" rel="noopener">Odoo Store ↗</a>
          <a href="contact.html" class="${page === 'contact.html' ? 'active' : ''}">Contact</a>
        </div>
        <div class="pill ${isAvail ? '' : 'not-avail'}">${isAvail ? 'Taking projects' : 'Unavailable'}</div>
      </div>
    `;

    const navEl = navContainer.querySelector('.nav');
    const toggle = navContainer.querySelector('.nav-toggle');
    toggle.addEventListener('click', () => {
      const open = navEl.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '✕' : '☰';
    });
  }

  function renderFooter(data) {
    const footerContainer = document.getElementById('footer-container');
    if (!footerContainer) return;

    const year = new Date().getFullYear();

    footerContainer.innerHTML = `
      <span>${esc(data.site.name)} · Odoo apps &amp; development · ${esc(data.contact.location)} · <a href="${esc(data.contact.github)}" target="_blank" rel="noopener">GitHub</a></span>
      <span>© ${year} ${esc(data.site.name)}</span>
    `;
  }

  // "Work with me" cards (rate, availability, time zone, engagement types).
  // Content lives in the `hire:` block of portfolio_data.yaml; rendered into
  // every element carrying the .hire-mount class.
  function renderHire(data) {
    const cards = list(data.hire);
    document.querySelectorAll('.hire-mount').forEach(mount => {
      if (!cards.length) return;
      mount.innerHTML = `<div class="hire-grid">${cards.map((c, i) => `
        <div class="hire-card reveal">
          <div class="hire-k">${esc(c.k)}</div>
          <div class="hire-v${i === 0 ? ' grad-text' : ''}">${esc(c.v)}</div>
          <div class="hire-n">${esc(c.n)}</div>
        </div>`).join('')}</div>`;
    });
  }

  // Render Home Page Details
  function renderHomePage(data) {
    // 1. Tagline/Descs
    const heroTag = document.getElementById('hero-tag');
    const heroTitle = document.getElementById('hero-title');
    const heroDesc = document.getElementById('hero-desc');
    const btnRow = document.getElementById('btn-row');

    // Hero copy now lives in index.html so that crawlers and no-JS clients see
    // it. Do not overwrite it here — that would duplicate the same string in two
    // places and let them drift apart.
    void heroTag; void heroTitle; void heroDesc; void btnRow;

    // 2. Stats
    const statsContainer = document.getElementById('stats-container');
    if (statsContainer) {
      statsContainer.innerHTML = data.stats.map(stat => {
        const value = String(stat.value);
        // Only pure "250+" / "54k+" style values animate; anything else is shown as-is.
        const m = value.match(/^(\d+)(k?\+?)$/);
        const attrs = m ? ` data-count="${m[1]}" data-suffix="${esc(m[2])}"` : '';
        const small = value.length > 8 ? ' style="font-size:20px; line-height:1.55;"' : '';
        return `
        <div class="stat reveal">
          <div class="stat-n"${attrs}${small}>${esc(value)}</div>
          <div class="stat-l">${esc(stat.label)}</div>
        </div>`;
      }).join('');
    }

    // 4. Featured Projects list
    const featuredGrid = document.getElementById('featured-grid');
    if (featuredGrid) {
      const featuredProjects = sortProjectsNewestFirst(
        data.projects.filter(p => p.featured === true)
      ).slice(0, 6);
      featuredGrid.innerHTML = featuredProjects.map(proj => {
        const colorClass = getCategoryColorClass(proj.category);
        return `
          <div class="proj-card reveal" onclick="window.location.href='project.html?id=${proj.id}'">
            <div class="proj-img">
              ${renderProjectImage(proj)}
            </div>
            <div class="proj-body">
              <div class="proj-name">${proj.title}</div>
              <div class="proj-desc">${proj.short_desc}</div>
              <div class="proj-tags">
                <span class="tag ${colorClass}">${esc(proj.role.split(' · ')[1] || '')}</span>
                ${list(proj.tags).slice(0, 2).map(tag => `<span class="tag ${colorClass}">${tag}</span>`).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    }

  // Render Odoo List Page
  function renderOdooPage(data) {
    const listContainer = document.getElementById('odoo-list-container');
    if (!listContainer) return;

    const odooProjects = sortProjectsNewestFirst(
      data.projects.filter(p => p.category === 'odoo')
    );
    
    // Collect all unique tags for filter subnav
    const tagsSet = new Set();
    odooProjects.forEach(p => list(p.tags).forEach(t => tagsSet.add(t)));
    const uniqueTags = Array.from(tagsSet);

    // Render filter bar buttons
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) {
      filterBar.innerHTML = `
        <button class="filter on" data-tag="all">All</button>
        ${uniqueTags.map(tag => `<button class="filter" data-tag="${tag}">${tag}</button>`).join('')}
      `;

      // Set up click listeners for tag filtering
      const filterButtons = filterBar.querySelectorAll('.filter');
      filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
          filterButtons.forEach(b => b.classList.remove('on'));
          this.classList.add('on');
          const selectedTag = this.getAttribute('data-tag');
          renderList(selectedTag);
        });
      });
    }

    function renderList(tagFilter) {
      let filtered = odooProjects;
      if (tagFilter !== 'all') {
        filtered = sortProjectsNewestFirst(
          odooProjects.filter(p => list(p.tags).includes(tagFilter))
        );
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="color:var(--color-text-secondary); text-align:center; padding:30px;">No matching apps found.</div>';
        return;
      }

      listContainer.innerHTML = filtered.map(proj => {
        const modulesStr = list(proj.modules).length > 0
          ? `<strong>Works with:</strong> ${esc(list(proj.modules).join(' · '))}`
          : `<strong>Tech:</strong> ${esc(list(proj.tech_stack).join(' · '))}`;

        return `
          <div class="pcard" onclick="window.location.href='project.html?id=${proj.id}'">
            <div class="pcard-img">
              ${renderProjectImage(proj)}
            </div>
            <div class="pcard-body">
              <div class="pcard-top">
                <div class="pcard-name">${proj.title}</div>
                <div class="pcard-date">${esc(proj.role)}</div>
              </div>
              <div class="pcard-desc">${proj.full_desc || proj.short_desc}</div>
              <div class="pcard-tags">
                ${list(proj.tags).map(t => `<span class="tg">${esc(t)}</span>`).join('')}
              </div>
              <div class="pcard-modules">${modulesStr}</div>
              <div class="view-btn">View details →</div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Initial render of all
    renderList('all');
  }

  // Render Project Detail Page
  function renderProjectDetailPage(data) {
    const urlParams = new URLSearchParams(window.location.search);
    const projId = urlParams.get('id');

    if (!projId) {
      window.location.href = 'index.html';
      return;
    }

    // Find project. Navigate within the current category only — previously this
    // sorted across every category, so "Next" from an Odoo project could land on
    // an Android app while the "Back to Odoo ERP Projects" link stayed put.
    const projectRecord = data.projects.find(p => p.id === projId);
    const sortedProjects = sortProjectsNewestFirst(
      projectRecord ? data.projects.filter(p => p.category === projectRecord.category)
                    : data.projects
    );
    const projectIndex = sortedProjects.findIndex(p => p.id === projId);
    if (projectIndex === -1) {
      window.location.href = 'index.html';
      return;
    }

    const project = sortedProjects[projectIndex];

    // Banner & Label
    const bannerContainer = document.getElementById('banner-container');
    if (bannerContainer) {
      bannerContainer.innerHTML = renderProjectImage(project, true);
    }

    // Back button
    const backBtn = document.getElementById('back-link');
    if (backBtn) {
      const categoryName = "All apps";
      const categoryUrl = "apps.html";
      
      backBtn.innerHTML = `← Back to <em>${categoryName}</em>`;
      backBtn.onclick = () => window.location.href = categoryUrl;
    }

    // Metadata
    const detailTitle = document.getElementById('detail-title');
    const detailSub = document.getElementById('detail-sub');
    const detailTags = document.getElementById('detail-tags');
    const aboutText = document.getElementById('about-text');
    const highlightsList = document.getElementById('highlights-list');

    if (detailTitle) detailTitle.innerText = project.title;
    if (detailSub) {
      detailSub.innerText = `${project.client} · ${project.odoo_version}`;
    }
    if (detailTags) {
      detailTags.innerHTML = list(project.tags).map(t => `<span class="dtg">${esc(t)}</span>`).join('');
    }
    if (aboutText) {
      aboutText.innerText = project.full_desc || project.short_desc;
    }
    if (highlightsList) {
      if (project.highlights && project.highlights.length > 0) {
        highlightsList.innerHTML = project.highlights.map(h => `<li>${h}</li>`).join('');
      } else {
        // Fallback label if highlights missing
        highlightsList.innerHTML = `<li>Built for Odoo 18.</li>`;
      }
    }

    // Sidebar Blocks
    const clientVal = document.getElementById('client-val');
    const yearVal = document.getElementById('year-val');
    const versionBlock = document.getElementById('version-block');
    const versionVal = document.getElementById('version-val');
    const roleVal = document.getElementById('role-val');
    const modulesBlock = document.getElementById('modules-block');
    const modulesList = document.getElementById('modules-list');
    const techList = document.getElementById('tech-list');

    if (clientVal) clientVal.innerText = project.client;
    if (yearVal) {
      yearVal.innerHTML = project.store_url
        ? `<a href="${esc(project.store_url)}" target="_blank" rel="noopener" class="btn-primary" style="display:inline-block; padding:8px 14px; font-size:13px;">View on Odoo Apps ↗</a>`
        : '';
    }
    
    if (project.category === 'odoo' && project.odoo_version) {
      if (versionBlock) versionBlock.style.display = 'block';
      if (versionVal) versionVal.innerText = project.odoo_version;
    } else {
      if (versionBlock) versionBlock.style.display = 'none';
    }

    if (roleVal) roleVal.innerText = project.role || '';
    
    if (project.modules && project.modules.length > 0) {
      if (modulesBlock) modulesBlock.style.display = 'block';
      if (modulesList) {
        modulesList.innerHTML = project.modules.map(m => `<span class="mod-tag">${m}</span>`).join('');
      }
    } else {
      if (modulesBlock) modulesBlock.style.display = 'none';
    }

    if (techList && project.tech_stack) {
      techList.innerHTML = project.tech_stack.map(t => `<span class="mod-tag">${t}</span>`).join('');
    }

    // Navigation footer (Prev/Next)
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (prevBtn) {
      if (projectIndex > 0) {
        const prevProj = sortedProjects[projectIndex - 1];
        prevBtn.innerHTML = `← ${prevProj.title}`;
        prevBtn.classList.remove('disabled');
        prevBtn.onclick = () => window.location.href = `project.html?id=${prevProj.id}`;
      } else {
        prevBtn.innerHTML = `← First app`;
        prevBtn.classList.add('disabled');
        prevBtn.onclick = null;
      }
    }

    if (nextBtn) {
      if (projectIndex < sortedProjects.length - 1) {
        const nextProj = sortedProjects[projectIndex + 1];
        nextBtn.innerHTML = `${nextProj.title} →`;
        nextBtn.classList.remove('disabled');
        nextBtn.onclick = () => window.location.href = `project.html?id=${nextProj.id}`;
      } else {
        nextBtn.innerHTML = `Last app →`;
        nextBtn.classList.add('disabled');
        nextBtn.onclick = null;
      }
    }
  }

  // Render Contact Page
  function renderContactPage(data) {
    // 1. Fill contact metadata
    const phoneVal = document.getElementById('phone-val');
    const emailVal = document.getElementById('email-val');
    const linkedinVal = document.getElementById('linkedin-val');
    const githubVal = document.getElementById('github-val');
    const locationVal = document.getElementById('location-val');
    const availText = document.getElementById('avail-text');
    const availDot = document.getElementById('avail-dot');


    if (emailVal) {
      emailVal.innerHTML = `<a href="mailto:${data.contact.email}">${data.contact.email}</a>`;
    }
    if (linkedinVal && data.contact.linkedin) {
      const username = data.contact.linkedin.split('/').pop();
      linkedinVal.innerHTML = `<a href="${esc(data.contact.linkedin)}" target="_blank" rel="noopener">linkedin.com/in/${esc(username)}</a>`;
    }
    if (githubVal) {
      const username = data.contact.github.split('/').pop();
      githubVal.innerHTML = `<a href="${esc(data.contact.github)}" target="_blank" rel="noopener">github.com/${esc(username)}</a>`;
    }
    if (locationVal) {
      locationVal.innerText = `${data.contact.location}${data.contact.remote ? ' (Remote OK)' : ''}`;
    }

    if (data.site.available_for_work) {
      if (availText) availText.innerText = "Available for new projects";
      if (availDot) {
        availDot.style.background = "#639922";
        availDot.style.boxShadow = "0 0 8px #639922";
      }
    } else {
      if (availText) availText.innerText = "Not available at this moment";
      if (availDot) {
        availDot.style.background = "var(--color-text-tertiary)";
        availDot.style.boxShadow = "none";
      }
    }

    // 2. Submit Action Form (AJAX via Formspree)
    const contactForm = document.getElementById('contact-form');
    const statusMsg = document.getElementById('form-status-msg');
    
    if (contactForm) {
      contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = contactForm.querySelector('.send-btn');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = "Sending message...";

        if (statusMsg) {
          statusMsg.style.display = 'none';
          statusMsg.className = 'form-status';
        }

        const dataPayload = new FormData(contactForm);
        const actionUrl = contactForm.getAttribute('action');

        try {
          const response = await fetch(actionUrl, {
            method: 'POST',
            body: dataPayload,
            headers: {
              'Accept': 'application/json'
            }
          });

          if (response.ok) {
            if (statusMsg) {
              statusMsg.innerText = "Thank you! Your message has been sent successfully.";
              statusMsg.className = "form-status success";
            }
            contactForm.reset();
          } else {
            const errData = await response.json();
            throw new Error(errData.errors ? errData.errors.map(err => err.message).join(', ') : 'Form submission failed');
          }
        } catch (err) {
          if (statusMsg) {
            statusMsg.innerText = `Oops! There was a problem: ${err.message}`;
            statusMsg.className = "form-status error";
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerText = originalText;
        }
      });
    }
  }
})();
