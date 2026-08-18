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
     Scroll position, not time, drives the video. All-intra encode makes
     currentTime seeks cheap in both directions. Falls back to the restored
     still on reduced motion or load failure. */

  var scrub = document.querySelector('.scrub');
  if (scrub) {
    var stageWords = [].slice.call(document.querySelectorAll('.stage-word span'));
    var stageLines = [].slice.call(document.querySelectorAll('.stage-line span'));
    var bar = document.querySelector('.scrub-progress i');
    var hint = document.querySelector('.scrub-hint');
    var sv = document.getElementById('scrubVideo');

    var swapToFallback = function () {
      var tpl = document.getElementById('fallbackHero');
      if (tpl && scrub.parentNode) scrub.replaceWith(tpl.content.cloneNode(true));
      navState();
    };

    if (reduced || !sv) {
      swapToFallback();
    } else {
      var svDur = 0, sTarget = 0, sCur = -1;

      /* portrait phones get a dedicated 9:16 crop — the 16:9 encodes upscale
         ~5x under object-fit:cover on portrait screens and look soft */
      var portrait = innerHeight > innerWidth;
      var srcEl = sv.querySelector('source');
      if (srcEl) {
        var pick = null;
        if (portrait) pick = 'assets/restoration_scrub_portrait.mp4?v=3';
        else if (innerWidth < 1000) pick = 'assets/restoration_scrub_960.mp4?v=3';
        else if (innerWidth * (window.devicePixelRatio || 1) >= 1800) pick = 'assets/restoration_scrub_1920.mp4?v=3';
        if (pick) { srcEl.src = pick; sv.load(); }
      }
      sv.pause();
      sv.addEventListener('loadedmetadata', function () { svDur = sv.duration; });
      setTimeout(function () { if (sv.readyState === 0) swapToFallback(); }, 5000);

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

      var onScroll = function () {
        var total = scrub.offsetHeight - innerHeight;
        sTarget = total > 0 ? clamp01(-scrub.getBoundingClientRect().top / total) : 0;
      };
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll, { passive: true });
      onScroll();

      /* ?capture=0.5 — deterministic state for screenshots: seek directly, no rAF loop */
      if (capture) {
        var cf = clamp01(parseFloat(location.search.split('capture=')[1]) || 0);
        var applyCap = function () {
          if (sv.duration) { try { sv.currentTime = cf * Math.max(sv.duration - 0.06, 0); } catch (e) {} }
          if (bar) bar.style.width = (cf * 100).toFixed(2) + '%';
          setStage(cf);
          if (hint) hint.classList.add('gone');
        };
        /* headless captures can't decode a seek in time — pin the matching stage still over the video */
        var capStill = cf < 0.30 ? 'stage_a_1600.jpg' : cf < 0.62 ? 'stage_b_1600.jpg' : cf < 0.90 ? 'stage_c_1600.jpg' : 'stage_d_1600.jpg';
        var capImg = document.createElement('img');
        capImg.src = 'assets/' + capStill;
        capImg.alt = '';
        capImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
        sv.insertAdjacentElement('afterend', capImg);
        sv.addEventListener('loadedmetadata', applyCap);
        applyCap();
        /* pin to fixed pixels in capture mode so tall full-page windows stack naturally */
        scrub.style.height = '900px';
        var capStage = scrub.querySelector('.scrub-stage');
        if (capStage) capStage.style.height = '900px';
        var capTop = scrub.querySelector('.hero-topline');
        if (capTop) capTop.style.paddingTop = '140px';
      } else {

      /* self-test: ?scrubtest auto-scrolls and records currentTime samples */
      if (location.search.indexOf('scrubtest') !== -1) {
        var stLog = [], stT0 = null;
        (function stStep(ts) {
          if (stT0 === null) stT0 = ts;
          var el = (ts - stT0) / 4000;
          scrollTo(0, (scrub.offsetHeight - innerHeight) * Math.min(el, 1));
          dispatchEvent(new Event('scroll'));
          stLog.push(sv.currentTime.toFixed(2));
          if (el < 1.3) requestAnimationFrame(stStep);
          else {
            var d = document.createElement('div');
            d.id = 'scrubtest-result';
            d.style.display = 'none';
            d.textContent = 'SCRUBTEST:' + stLog.filter(function (_, i) { return i % 25 === 0; }).join(',') + '|dur:' + (svDur || 0).toFixed(2);
            document.body.appendChild(d);
          }
        })(performance.now());
      }

      (function scrubLoop() {
        var gap = sTarget - sCur;
        /* adaptive chase: sprint on flings, glide on eases */
        sCur += gap * (Math.abs(gap) > 0.18 ? 0.34 : 0.15);
        if (Math.abs(gap) < 0.0006) sCur = sTarget;
        if (svDur && !sv.seeking && Math.abs(sCur * svDur - sv.currentTime) > 0.008) {
          try { sv.currentTime = clamp01(sCur) * Math.max(svDur - 0.06, 0); } catch (e) {}
        }
        var p = clamp01(sCur);
        if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
        setStage(p);
        if (hint) hint.classList.toggle('gone', p > 0.06);
        requestAnimationFrame(scrubLoop);
      })();
      }
    }
  }

  /* ---------- before / after sliders ---------- */

  document.querySelectorAll('.ba').forEach(function (ba) {
    var after = ba.querySelector('.after-img');
    var handle = ba.querySelector('.ba-handle');
    if (!after || !handle) return;
    var set = function (x) {
      var r = ba.getBoundingClientRect();
      var p = clamp01((x - r.left) / r.width) * 100;
      after.style.clipPath = 'inset(0 0 0 ' + p + '%)';
      handle.style.left = p + '%';
    };
    var drag = false;
    var move = function (e) { if (drag) set(e.touches ? e.touches[0].clientX : e.clientX); };
    ba.addEventListener('pointerdown', function (e) { drag = true; set(e.clientX); });
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', function () { drag = false; });
    ba.addEventListener('touchstart', function (e) { drag = true; move(e); }, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', function () { drag = false; });
  });

  /* ---------- footer year ---------- */

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
