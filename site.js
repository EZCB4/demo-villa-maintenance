/* Copperstone Technical Services — Synth Studio portfolio demo
   Shared behaviour: nav state, reveal-on-scroll, scroll-scrubbed restoration hero,
   before/after sliders. No dependencies. */

(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var capture = location.search.indexOf('capture') !== -1; /* freeze motion for screenshots */
  if (capture) document.documentElement.classList.add('capture');
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ---------- nav ---------- */

  var nav = document.querySelector('.nav');
  var burger = document.querySelector('.nav-burger');
  if (burger) {
    burger.addEventListener('click', function () {
      nav.classList.toggle('open');
      document.body.classList.toggle('menu-open', nav.classList.contains('open'));
      burger.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    });
  }
  function navState() {
    if (!nav) return;
    if (nav.classList.contains('static-light')) { nav.classList.add('on-light'); return; }
    var scrubEl = document.querySelector('.scrub');
    var heroEl = document.querySelector('.page-hero');
    var threshold = scrubEl ? scrubEl.offsetHeight - innerHeight * 1.05
                  : heroEl ? heroEl.offsetHeight - 90
                  : innerHeight * 0.2;
    nav.classList.toggle('solid', scrollY > Math.max(threshold, 60));
  }
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav && nav.classList.contains('open')) {
      nav.classList.remove('open');
      document.body.classList.remove('menu-open');
      if (burger) { burger.setAttribute('aria-expanded', 'false'); burger.focus(); }
    }
  });
  addEventListener('scroll', navState, { passive: true });
  navState();

  /* ---------- reveal on scroll ---------- */

  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.14 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- scroll-scrubbed restoration hero ----------
     Scroll drives a canvas that blits pre-decoded WebP frames (ImageBitmap).
     Decoding happens once, spread across load; scrubbing is a pure draw,
     which stays smooth on every device. Frames load first/last first, then
     by subdivision, so coarse scrubbing works within the first second.
     Falls back to the restored still on reduced motion, missing APIs, or
     if no frame arrives in time. */

  var scrub = document.querySelector('.scrub');
  if (scrub) {
    var stageWords = [].slice.call(document.querySelectorAll('.stage-word span'));
    var stageLines = [].slice.call(document.querySelectorAll('.stage-line span'));
    var bar = document.querySelector('.scrub-progress i');
    var hint = document.querySelector('.scrub-hint');
    var cv = document.getElementById('scrubCanvas');

    var swapToFallback = function () {
      var tpl = document.getElementById('fallbackHero');
      if (tpl && scrub.parentNode) scrub.replaceWith(tpl.content.cloneNode(true));
      navState();
    };

    /* stage windows over scrub progress: [start, word index] */
    var stages = [
      [0.00, 0], /* Assess  */
      [0.30, 1], /* Repair  */
      [0.62, 2], /* Restore */
      [0.90, 3]  /* Maintain */
    ];
    var liveStage = -1;
    function setStage(p) {
      var idx = 0;
      for (var i = 0; i < stages.length; i++) if (p >= stages[i][0]) idx = stages[i][1];
      if (idx === liveStage) return;
      liveStage = idx;
      stageWords.forEach(function (w, i) { w.classList.toggle('live', i === idx); });
      stageLines.forEach(function (l, i) { l.classList.toggle('live', i === idx); });
    }

    if (reduced || !cv || !('createImageBitmap' in window) || !window.fetch) {
      swapToFallback();
    } else if (capture) {
      /* ?capture=0.5 — deterministic screenshot state: pin the matching still, no engine */
      var cf = clamp01(parseFloat(location.search.split('capture=')[1]) || 0);
      var capStill = cf < 0.30 ? 'stage_a_1600.jpg' : cf < 0.62 ? 'stage_b_1600.jpg' : cf < 0.90 ? 'stage_c_1600.jpg' : 'stage_d_1600.jpg';
      var capImg = document.createElement('img');
      capImg.src = 'assets/' + capStill;
      capImg.alt = '';
      capImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      cv.insertAdjacentElement('afterend', capImg);
      if (bar) bar.style.width = (cf * 100).toFixed(2) + '%';
      setStage(cf);
      if (hint) hint.classList.add('gone');
      /* pin to fixed pixels so tall full-page capture windows stack naturally */
      scrub.style.height = '900px';
      var capStage = scrub.querySelector('.scrub-stage');
      if (capStage) capStage.style.height = '900px';
      var capTop = scrub.querySelector('.hero-topline');
      if (capTop) capTop.style.paddingTop = '140px';
    } else {
      var portrait = innerHeight > innerWidth;
      var SET = portrait
        ? { pre: 'assets/frames/p-', n: 96,  fw: 1080, fh: 1440 }
        : { pre: 'assets/frames/l-', n: 129, fw: 1728, fh: 972 };
      var ctx = cv.getContext('2d');
      var frames = new Array(SET.n);
      var gotFirst = false, drawnIdx = -1, cw = 0, ch = 0;
      var sTarget = 0, sCur = -1;

      function sizeCanvas() {
        var r = cv.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        /* backing store never exceeds source resolution or 2x CSS pixels */
        var scale = Math.min(window.devicePixelRatio || 1, SET.fw / r.width, 2);
        var w = Math.round(r.width * scale), h = Math.round(r.height * scale);
        if (w !== cw || h !== ch) { cw = cv.width = w; ch = cv.height = h; drawnIdx = -1; }
      }

      function draw(p) {
        if (!cw) sizeCanvas();
        if (!cw) return;
        var want = Math.round(clamp01(p) * (SET.n - 1));
        var idx = -1;
        for (var d = 0; d < SET.n; d++) { /* nearest loaded frame */
          if (want - d >= 0 && frames[want - d]) { idx = want - d; break; }
          if (want + d < SET.n && frames[want + d]) { idx = want + d; break; }
        }
        if (idx < 0 || idx === drawnIdx) return;
        drawnIdx = idx;
        var bm = frames[idx];
        var s = Math.max(cw / bm.width, ch / bm.height); /* object-fit: cover */
        var sw = cw / s, sh = ch / s;
        ctx.drawImage(bm, (bm.width - sw) / 2, (bm.height - sh) / 2, sw, sh, 0, 0, cw, ch);
      }

      /* first + last, then binary subdivision */
      var order = (function () {
        var out = [0, SET.n - 1], seen = {}; seen[0] = 1; seen[SET.n - 1] = 1;
        var spans = [[0, SET.n - 1]];
        while (spans.length) {
          var sp = spans.shift(), mid = (sp[0] + sp[1]) >> 1;
          if (!seen[mid]) { seen[mid] = 1; out.push(mid); }
          if (mid - sp[0] > 1) spans.push([sp[0], mid]);
          if (sp[1] - mid > 1) spans.push([mid, sp[1]]);
        }
        return out;
      })();
      var inflight = 0, cursor = 0;
      function pump() {
        while (inflight < 6 && cursor < order.length) {
          (function (i) {
            inflight++;
            var name = ('00' + (i + 1)).slice(-3);
            fetch(SET.pre + name + '.webp').then(function (r) {
              if (!r.ok) throw new Error('http');
              return r.blob();
            }).then(function (b) { return createImageBitmap(b); }).then(function (bm) {
              frames[i] = bm;
              gotFirst = true;
              drawnIdx = -1; /* allow a refining redraw */
              inflight--; pump();
            }).catch(function () { failed++; inflight--; pump(); });
          })(order[cursor++]);
        }
      }
      var failed = 0;
      pump();
      var fallbackChecks = 0;
      (function armFallback() {
        setTimeout(function () {
          if (gotFirst) return;
          /* fall back on real failure, keep waiting on a slow network (poster shows meanwhile) */
          if (failed >= 4 || fallbackChecks++ > 5) { swapToFallback(); return; }
          armFallback();
        }, 4000);
      })();

      var onScroll = function () {
        var total = scrub.offsetHeight - innerHeight;
        sTarget = total > 0 ? clamp01(-scrub.getBoundingClientRect().top / total) : 0;
      };
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', function () { sizeCanvas(); onScroll(); }, { passive: true });
      onScroll();

      /* self-test: ?scrubtest auto-scrolls and records drawn frame indices */
      if (location.search.indexOf('scrubtest') !== -1) {
        var stLog = [], stT0 = null;
        (function stStep(ts) {
          if (stT0 === null) stT0 = ts;
          var el = (ts - stT0) / 4000;
          scrollTo(0, (scrub.offsetHeight - innerHeight) * Math.min(el, 1));
          dispatchEvent(new Event('scroll'));
          stLog.push(drawnIdx);
          if (el < 1.3) requestAnimationFrame(stStep);
          else {
            var d = document.createElement('div');
            d.id = 'scrubtest-result';
            d.style.display = 'none';
            d.textContent = 'SCRUBTEST:' + stLog.filter(function (_, i) { return i % 25 === 0; }).join(',') + '|frames:' + SET.n;
            document.body.appendChild(d);
          }
        })(performance.now());
      }

      (function scrubLoop() {
        var gap = sTarget - sCur;
        /* adaptive chase: sprint on flings, glide on eases */
        sCur += gap * (Math.abs(gap) > 0.18 ? 0.34 : 0.15);
        if (Math.abs(gap) < 0.0006) sCur = sTarget;
        var p = clamp01(sCur);
        draw(p);
        if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
        setStage(p);
        if (hint) hint.classList.toggle('gone', p > 0.06);
        requestAnimationFrame(scrubLoop);
      })();
    }
  }

  /* ---------- before / after sliders ---------- */

  document.querySelectorAll('.ba').forEach(function (ba) {
    var after = ba.querySelector('.after-img');
    var handle = ba.querySelector('.ba-handle');
    if (!after || !handle) return;
    var pct = 50;
    var setPct = function (p) {
      pct = p < 0 ? 0 : p > 100 ? 100 : p;
      after.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
      handle.style.left = pct + '%';
      handle.setAttribute('aria-valuenow', Math.round(pct));
    };
    var set = function (x) {
      var r = ba.getBoundingClientRect();
      setPct(clamp01((x - r.left) / r.width) * 100);
    };
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', 'Compare before and after');
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');
    handle.setAttribute('aria-valuenow', '50');
    handle.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setPct(pct - 5); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setPct(pct + 5); }
    });
    var drag = false;
    var move = function (e) { if (drag) set(e.touches ? e.touches[0].clientX : e.clientX); };
    ba.addEventListener('pointerdown', function (e) { drag = true; set(e.clientX); });
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', function () { drag = false; });
    ba.addEventListener('touchstart', function (e) { drag = true; move(e); }, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', function () { drag = false; });
  });


  /* ---------- demo: disabled contact links show a toast ---------- */

  var toastEl = null, toastTimer = null;
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href="#demo"]') : null;
    if (!a) return;
    e.preventDefault();
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'demo-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.textContent = 'This is a demo site. Contact buttons are switched off.';
      document.body.appendChild(toastEl);
    }
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  });
  /* ---------- footer year ---------- */

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
