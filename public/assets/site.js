/* Eternal Illuminati Covenant: progressive enhancement for the public site */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // ── Mobile navigation ──
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.getElementById('site-nav');
    if (toggle && nav) {
      var label = toggle.querySelector('.sr-only');
      var setOpen = function (open) {
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        document.body.style.overflow = open ? 'hidden' : '';
        if (label) label.textContent = open ? label.dataset.labelClose : label.dataset.labelOpen;
      };
      toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); }
      });
      window.matchMedia('(min-width: 1081px)').addEventListener('change', function (m) { if (m.matches) setOpen(false); });
    }
    document.querySelectorAll('.sub-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sub = btn.nextElementSibling;
        var open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        if (sub) sub.classList.toggle('open', open);
      });
    });

    // ── Subtle reveal on scroll ──
    var revealables = document.querySelectorAll('[data-reveal]');
    if (!reduced && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      revealables.forEach(function (el) { io.observe(el); });
    } else {
      revealables.forEach(function (el) { el.classList.add('is-visible'); });
    }

    // ── Hero video: desktop only, never on reduced-motion or data-saver connections ──
    var conn = navigator.connection || {};
    if (!reduced && !conn.saveData && window.matchMedia('(min-width: 900px)').matches) {
      document.querySelectorAll('video[data-src]').forEach(function (v) {
        v.src = v.dataset.src;
        v.addEventListener('canplay', function () { v.classList.add('ready'); v.play().catch(function () {}); }, { once: true });
        v.load();
      });
    }

    // ── Filter chips (timeline eras, archive types) ──
    document.querySelectorAll('[data-filter-group]').forEach(function (group) {
      var list = document.querySelector('[data-filter-list="' + group.dataset.filterGroup + '"]');
      if (!list) return;
      group.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filter]');
        if (!btn) return;
        var value = btn.dataset.filter;
        group.querySelectorAll('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        list.querySelectorAll('[data-filter-value]').forEach(function (item) {
          item.hidden = !!value && item.dataset.filterValue !== value;
        });
      });
    });

    // ── Focus status messages after a form post ──
    var focusEl = document.querySelector('[data-focus]');
    if (focusEl) { focusEl.focus({ preventScroll: true }); focusEl.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); }

    // ── Prevent double submission ──
    document.querySelectorAll('form[method="post"]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        if (e.defaultPrevented) return;
        setTimeout(function () { f.querySelectorAll('button[type="submit"]').forEach(function (b) { b.disabled = true; }); }, 0);
      });
    });

    initApplication();
  });

  // ───────── Multi-step application form ─────────
  function initApplication() {
    var form = document.querySelector('[data-multistep]');
    if (!form) return;
    var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
    var progress = form.querySelector('[data-progress]');
    var current = 0;
    form.noValidate = true;
    form.dataset.ready = '1';
    if (progress) progress.hidden = false;
    form.querySelectorAll('[data-step-nav]').forEach(function (n) { n.hidden = false; });
    form.querySelectorAll('.step-nav.final [data-prev]').forEach(function (b) { b.hidden = false; });

    var errorStep = steps.findIndex(function (s) { return s.querySelector('.has-error'); });
    show(errorStep >= 0 ? errorStep : 0, false);

    function fieldsOf(step) {
      return Array.prototype.slice.call(step.querySelectorAll('input[name], select[name], textarea[name]')).filter(function (el) {
        return el.type !== 'hidden' && !el.closest('.hp');
      });
    }

    function setError(el, msg) {
      var field = el.closest('.field');
      if (!field) return;
      var p = field.querySelector('.error[data-client]');
      if (!msg) {
        field.classList.remove('has-error');
        el.removeAttribute('aria-invalid');
        if (p) p.remove();
        return;
      }
      field.classList.add('has-error');
      el.setAttribute('aria-invalid', 'true');
      if (!p) {
        p = document.createElement('p');
        p.className = 'error';
        p.dataset.client = '1';
        p.id = (el.id || el.name) + '-cerr';
        field.appendChild(p);
        el.setAttribute('aria-describedby', ((el.getAttribute('aria-describedby') || '') + ' ' + p.id).trim());
      }
      p.textContent = msg;
    }

    function validateFiles(input) {
      if (!input || !input.files) return '';
      var max = parseInt(input.dataset.maxFiles || '3', 10);
      var maxBytes = parseInt(input.dataset.maxBytes || '10485760', 10);
      if (input.files.length > max) return 'Maximum ' + max + ' files.';
      for (var i = 0; i < input.files.length; i++) {
        if (input.files[i].size > maxBytes) return input.files[i].name + ': file too large (max 10 MB).';
      }
      return '';
    }

    function validateStep(i) {
      var first = null;
      fieldsOf(steps[i]).forEach(function (el) {
        var msg = el.type === 'file' ? validateFiles(el) : el.checkValidity() ? '' : el.validationMessage;
        setError(el, msg);
        if (msg && !first) first = el;
      });
      if (first) first.focus();
      return !first;
    }

    function show(i, focus) {
      current = i;
      steps.forEach(function (s, k) { s.classList.toggle('active', k === i); });
      if (progress) {
        progress.querySelectorAll('[data-step-indicator]').forEach(function (li, k) {
          li.classList.toggle('done', k < i);
          li.classList.toggle('current', k === i);
          if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        });
      }
      if (i === steps.length - 1) buildReview();
      if (focus !== false) {
        var legend = steps[i].querySelector('legend');
        if (legend) { legend.setAttribute('tabindex', '-1'); legend.focus({ preventScroll: true }); }
        form.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      }
    }

    function valueText(el) {
      if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
      if (el.tagName === 'SELECT') return el.value ? el.options[el.selectedIndex].text : '—';
      return el.value.trim() || '—';
    }

    function buildReview() {
      var box = form.querySelector('[data-review]');
      var body = form.querySelector('[data-review-body]');
      if (!box || !body) return;
      box.hidden = false;
      body.innerHTML = '';
      steps.slice(0, steps.length - 1).forEach(function (s, k) {
        var block = document.createElement('section');
        block.className = 'review-block';
        var h = document.createElement('h3');
        var legend = s.querySelector('legend');
        h.textContent = legend ? legend.lastChild.textContent : 'Step ' + (k + 1);
        var edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'link-button';
        edit.textContent = document.documentElement.lang === 'fr' ? 'Modifier' : 'Edit';
        edit.addEventListener('click', function () { show(k); });
        h.appendChild(edit);
        block.appendChild(h);
        var dl = document.createElement('dl');
        fieldsOf(s).forEach(function (el) {
          var dt = document.createElement('dt');
          dt.textContent = el.dataset.label || el.name;
          var dd = document.createElement('dd');
          dd.textContent = valueText(el);
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        block.appendChild(dl);
        body.appendChild(block);
      });
    }

    form.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-next]')) { e.preventDefault(); if (validateStep(current)) show(current + 1); }
      else if (t.closest('[data-prev]')) { e.preventDefault(); show(Math.max(0, current - 1)); }
    });

    form.addEventListener('change', function (e) {
      var el = e.target;
      if (el.closest('.field') && el.closest('.field').classList.contains('has-error')) {
        setError(el, el.type === 'file' ? validateFiles(el) : el.checkValidity() ? '' : el.validationMessage);
      }
    });

    form.addEventListener('submit', function (e) {
      var submitter = e.submitter;
      if (submitter && submitter.value === 'save') {
        var email = form.querySelector('[name="email"]');
        if (email && !email.value) { e.preventDefault(); show(0); setError(email, email.validationMessage || 'Required'); email.focus(); }
        return;
      }
      for (var i = 0; i < steps.length; i++) {
        if (!validateStep(i)) { e.preventDefault(); show(i, false); validateStep(i); return; }
      }
    });
  }
})();
