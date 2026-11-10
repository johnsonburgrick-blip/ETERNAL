/* Admin portal: mobile-first enhancements */
(function () {
  'use strict';
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  ready(function () {
    // ── Local times ──
    $$('time[data-local-time]').forEach(function (t) {
      var d = new Date(t.getAttribute('datetime'));
      if (!isNaN(d)) t.textContent = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    });

    // ── Toasts fade out ──
    $$('[data-toast]').forEach(function (t) { setTimeout(function () { t.classList.add('fade'); }, 5000); });
    if (location.search.indexOf('ok=') >= 0 || location.search.indexOf('error=') >= 0) {
      var u = new URL(location.href); u.searchParams.delete('ok'); u.searchParams.delete('error');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }

    // ── Confirmation dialogs before sensitive/destructive actions ──
    var dialog = $('[data-confirm-dialog]');
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form.matches('form[data-confirm]') || form.dataset.confirmed === '1') return;
      e.preventDefault();
      var text = form.dataset.confirm;
      var go = function () { form.dataset.confirmed = '1'; if (form.requestSubmit) form.requestSubmit(e.submitter || undefined); else form.submit(); };
      if (dialog && dialog.showModal) {
        $('[data-confirm-text]', dialog).textContent = text;
        dialog.returnValue = '';
        dialog.showModal();
        dialog.addEventListener('close', function onClose() {
          dialog.removeEventListener('close', onClose);
          if (dialog.returnValue === 'ok') go();
        });
      } else if (window.confirm(text)) go();
    }, true);

    // ── Copy buttons ──
    $$('[data-copy]').forEach(function (el) {
      el.title = 'Tap to copy';
      el.addEventListener('click', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(el.textContent.replace(/\s/g, el.tagName === 'CODE' ? '' : '')).then(function () { flash('Copied'); });
      });
    });

    initRepeaters(document);
    initMediaFields(document);
    initUploaders();
    initAutosave();
    initDevicePreview();
    initUnsavedGuard();
  });

  function flash(msg, isError) {
    var t = document.createElement('div');
    t.className = 'toast floating ' + (isError ? 'err' : 'ok');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('fade'); }, 2200);
    setTimeout(function () { t.remove(); }, 3000);
  }

  // ───────── Repeaters (buttons, cards, gallery items) ─────────
  function initRepeaters(ctx) {
    $$('[data-repeater]', ctx).forEach(function (rep) {
      if (rep.dataset.init) return;
      rep.dataset.init = '1';
      var list = $('[data-repeater-list]', rep);
      var tpl = $('template[data-repeater-template]', rep);
      var max = parseInt(rep.dataset.max || '50', 10);
      var renumber = function () {
        $$(':scope > [data-repeater-row]', list).forEach(function (row, k) {
          $$('[name]', row).forEach(function (el) { el.name = el.name.replace(/\[(\d+|__i__)\](?=\[[a-z_]+\]$)/i, '[' + k + ']'); });
          $$('[id]', row).forEach(function (el) { el.id = el.id.replace(/-(\d+|__i__)-/, '-' + k + '-'); });
          $$('label[for]', row).forEach(function (el) { el.htmlFor = el.htmlFor.replace(/-(\d+|__i__)-/, '-' + k + '-'); });
        });
        var add = $('[data-repeater-add]', rep);
        if (add) add.disabled = list.children.length >= max;
      };
      rep.addEventListener('renumber', renumber);
      rep.addEventListener('click', function (e) {
        var t = e.target;
        var row = t.closest('[data-repeater-row]');
        if (t.closest('[data-repeater-add]')) {
          var frag = tpl.content.cloneNode(true);
          list.appendChild(frag);
          var added = list.lastElementChild;
          renumber();
          initMediaFields(added);
          var first = $('input,textarea,select', added);
          if (first) first.focus();
          changed(rep);
        } else if (row && t.closest('[data-rep-remove]')) { row.remove(); renumber(); changed(rep); }
        else if (row && t.closest('[data-rep-up]') && row.previousElementSibling) { list.insertBefore(row, row.previousElementSibling); renumber(); changed(rep); }
        else if (row && t.closest('[data-rep-down]') && row.nextElementSibling) { list.insertBefore(row.nextElementSibling, row); renumber(); changed(rep); }
      });
      renumber();
    });
  }
  function changed(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }

  // ───────── Client-side image optimisation ─────────
  var WIDTHS = [480, 960, 1600, 2400];
  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return loadImg(file); });
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  function encode(canvas, type, q) {
    return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, type, q); });
  }
  async function processImage(file) {
    if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|avif|heic)$/i.test(file.name)) return { file: file };
    try {
      var bmp = await loadBitmap(file);
      var w0 = bmp.width, h0 = bmp.height;
      var widths = WIDTHS.filter(function (w) { return w < w0; });
      widths.push(Math.min(w0, 2400));
      widths = widths.filter(function (w, i, a) { return a.indexOf(w) === i && w <= 2400; }).sort(function (a, b) { return a - b; });
      var variants = [];
      for (var i = 0; i < widths.length; i++) {
        var w = widths[i], h = Math.round(h0 * (w / w0));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, 0, w, h);
        var blob = await encode(c, 'image/webp', 0.82);
        if (!blob || blob.type !== 'image/webp') blob = await encode(c, 'image/jpeg', 0.85);
        variants.push({ w: w, h: h, blob: blob });
      }
      var main = variants[variants.length - 1];
      var ext = main.blob.type === 'image/webp' ? 'webp' : 'jpg';
      return { file: new File([main.blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: main.blob.type }), width: main.w, height: main.h, variants: variants, ext: ext };
    } catch (err) {
      return { file: file };
    }
  }

  function upload(url, file, extra, onProgress) {
    return processImage(file).then(function (p) {
      var fd = new FormData();
      fd.append('file', p.file);
      if (p.width) { fd.append('width', p.width); fd.append('height', p.height); }
      (p.variants || []).forEach(function (v) { fd.append('variant_' + v.w, new File([v.blob], 'v' + v.w + '.' + p.ext, { type: v.blob.type })); });
      fd.append('title', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 120));
      Object.keys(extra || {}).forEach(function (k) { fd.append(k, extra[k]); });
      return new Promise(function (res, rej) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = function () {
          var data = {};
          try { data = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) res(data); else rej(new Error(data.error || 'Upload failed (' + xhr.status + ')'));
        };
        xhr.onerror = function () { rej(new Error('Network error — check your connection and try again.')); };
        xhr.send(fd);
      });
    });
  }

  // ───────── Media library uploader ─────────
  function initUploaders() {
    $$('[data-uploader]').forEach(function (box) {
      var list = $('[data-upload-list]', box);
      $$('[data-upload-input]', box).forEach(function (input) {
        input.addEventListener('change', function () {
          var files = Array.prototype.slice.call(input.files || []);
          input.value = '';
          var catSel = $('select[name="category"]', box);
          var target = box.dataset.replace || '/admin/media/upload';
          files.reduce(function (chain, file) {
            return chain.then(function () {
              var li = document.createElement('li');
              li.innerHTML = '<span class="name"></span><progress max="100" value="0"></progress><span class="state">Optimising…</span>';
              $('.name', li).textContent = file.name;
              list.appendChild(li);
              var bar = $('progress', li), state = $('.state', li);
              return upload(target, file, { category: catSel ? catSel.value : 'general' }, function (p) { bar.value = p; state.textContent = p + '%'; })
                .then(function (data) {
                  bar.value = 100;
                  state.innerHTML = '';
                  var a = document.createElement('a'); a.href = '/admin/media/' + data.id; a.textContent = 'Uploaded ✓ — edit details';
                  state.appendChild(a);
                  if (data.reload) location.reload();
                })
                .catch(function (err) { state.textContent = err.message; li.classList.add('failed'); });
            });
          }, Promise.resolve());
        });
      });
    });
  }

  // ───────── Media fields (picker + inline upload) ─────────
  var pickerDialog;
  function openPicker(kind, onPick) {
    if (!pickerDialog) {
      pickerDialog = document.createElement('dialog');
      pickerDialog.className = 'picker';
      pickerDialog.innerHTML = '<form method="dialog" class="picker-head"><input type="search" placeholder="Search media" aria-label="Search media" data-picker-q><button class="btn small" value="close">Close</button></form><ul class="media-grid picker-grid" data-picker-grid></ul>';
      document.body.appendChild(pickerDialog);
    }
    var grid = $('[data-picker-grid]', pickerDialog), q = $('[data-picker-q]', pickerDialog);
    var load = function () {
      grid.innerHTML = '<li class="muted">Loading…</li>';
      fetch('/admin/media/library.json?kind=' + encodeURIComponent(kind === 'document' ? '' : kind) + '&q=' + encodeURIComponent(q.value), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (items) {
          grid.innerHTML = '';
          if (!items.length) grid.innerHTML = '<li class="muted">No files found. Upload one first.</li>';
          items.forEach(function (it) {
            var li = document.createElement('li');
            var b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = it.kind === 'image' ? '<img alt="" loading="lazy">' : '<span class="file-tile"></span>';
            if (it.kind === 'image') $('img', b).src = it.thumb; else $('.file-tile', b).textContent = it.kind === 'video' ? '▶ Video' : 'File';
            var cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = it.title || it.url.split('/').pop();
            b.appendChild(cap);
            b.addEventListener('click', function () { onPick(it); pickerDialog.close(); });
            li.appendChild(b);
            grid.appendChild(li);
          });
        })
        .catch(function () { grid.innerHTML = '<li class="error">Could not load the media library.</li>'; });
    };
    q.oninput = debounce(load, 300);
    load();
    pickerDialog.showModal();
  }

  function initMediaFields(ctx) {
    $$('[data-media-field]', ctx).forEach(function (box) {
      if (box.dataset.init || box.closest('template')) return;
      box.dataset.init = '1';
      var input = $('[data-mf-input]', box), preview = $('[data-mf-preview]', box), bar = $('[data-mf-progress]', box);
      var kind = box.dataset.kind || 'image';
      var setValue = function (url, thumb) {
        input.value = url;
        preview.innerHTML = '';
        if (url && kind === 'image') { var img = document.createElement('img'); img.src = thumb || url; img.alt = ''; preview.appendChild(img); }
        else if (url) { var s = document.createElement('span'); s.className = 'mf-file'; s.textContent = url; preview.appendChild(s); }
        else { var e = document.createElement('span'); e.className = 'mf-empty'; e.textContent = 'Nothing selected'; preview.appendChild(e); }
        changed(input);
      };
      input.addEventListener('change', function () { setValue(input.value.trim()); });
      $('[data-mf-pick]', box).addEventListener('click', function () { openPicker(kind, function (it) { setValue(it.url, it.thumb); }); });
      $('[data-mf-clear]', box).addEventListener('click', function () { setValue(''); });
      $$('[data-mf-upload]', box).forEach(function (fileInput) {
        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          fileInput.value = '';
          if (!file) return;
          bar.hidden = false; bar.value = 0;
          upload('/admin/media/upload', file, { category: 'general' }, function (p) { bar.value = p; })
            .then(function (data) { bar.hidden = true; setValue(data.url, data.thumb); flash('Uploaded'); })
            .catch(function (err) { bar.hidden = true; flash(err.message, true); });
        });
      });
    });
  }

  // ───────── Autosave drafts ─────────
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function initAutosave() {
    $$('form[data-autosave]').forEach(function (form) {
      var status = $('[data-autosave-status]', form);
      var frame = form.dataset.previewTarget ? document.getElementById(form.dataset.previewTarget) : null;
      var save = debounce(function () {
        if (status) status.textContent = 'Saving draft…';
        renumberAll(form);
        fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'x-autosave': '1' }, credentials: 'same-origin' })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function () {
            form.dataset.dirty = '';
            if (status) status.textContent = 'Draft saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (frame) { try { frame.contentWindow.location.reload(); } catch (e) { frame.src = frame.src; } }
          })
          .catch(function () { if (status) status.textContent = 'Could not autosave — use “Save draft”.'; });
      }, 2000);
      form.addEventListener('input', function () { form.dataset.dirty = '1'; if (status) status.textContent = 'Unsaved changes…'; save(); });
      form.addEventListener('submit', function () { form.dataset.dirty = ''; renumberAll(form); });
    });
  }
  function renumberAll(form) { $$('[data-repeater]', form).forEach(function (r) { r.dispatchEvent(new Event('renumber')); }); }

  function initUnsavedGuard() {
    $$('form[data-unsaved-guard]').forEach(function (form) {
      form.addEventListener('input', function () { form.dataset.dirty = '1'; });
      form.addEventListener('submit', function () { form.dataset.dirty = ''; });
    });
    window.addEventListener('beforeunload', function (e) {
      if ($$('form[data-unsaved-guard][data-dirty="1"]').length) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ───────── Responsive previews (mobile / tablet / desktop) ─────────
  function initDevicePreview() {
    var stage = $('[data-device-stage]');
    if (!stage) return;
    var frame = $('[data-device-frame]', stage);
    var width = 390;
    var fit = function () {
      var avail = stage.clientWidth;
      var scale = Math.min(1, avail / width);
      frame.style.width = width + 'px';
      frame.style.transform = 'scale(' + scale + ')';
      var h = Math.max(560, (window.innerHeight - stage.getBoundingClientRect().top - 24) / scale);
      frame.style.height = h + 'px';
      stage.style.height = h * scale + 'px';
    };
    $$('[data-device]').forEach(function (b) {
      b.addEventListener('click', function () {
        width = parseInt(b.dataset.device, 10);
        $$('[data-device]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        fit();
      });
    });
    window.addEventListener('resize', debounce(fit, 100));
    fit();
  }
})();
