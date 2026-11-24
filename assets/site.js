/* Bizzy Bee website — shared behaviour for every page.
   Everything here is progressive: pages read fine without it. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var doc = document.documentElement, body = document.body;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  // ---------------- nav: shadow line once scrolled, mobile menu
  var nav = $('#nav');
  function stuck() { if (nav) nav.classList.toggle('stuck', scrollY > 8); }
  addEventListener('scroll', stuck, { passive: true }); stuck();

  var mb = $('.menu-btn'), menu = $('#menu');
  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    if (mb) { mb.setAttribute('aria-expanded', open ? 'true' : 'false'); mb.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
    if (menu) { if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', ''); }
  }
  if (mb && menu) {
    setMenu(false);
    mb.addEventListener('click', function () { setMenu(!body.classList.contains('menu-open')); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && body.classList.contains('menu-open')) { setMenu(false); mb.focus(); } });
    addEventListener('resize', function () { if (innerWidth > 960) setMenu(false); });
  }

  // ---------------- switches (sample rule toggles)
  $$('.sw').forEach(function (s) {
    s.addEventListener('click', function () { s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); });
  });

  // ---------------- Ruby's calendar cells
  var order = [3, 9, 1, 15, 12, 6, 18, 0, 10, 20, 5, 14, 8, 17, 2, 11, 19, 4, 13, 7, 16];
  $$('.cal').forEach(function (cal) {
    var c = '';
    for (var k = 0; k < 21; k++) c += '<i style="animation-delay:' + (order.indexOf(k) * 0.12).toFixed(2) + 's"></i>';
    cal.innerHTML = c;
  });

  // ---------------- reveal on scroll
  var io = 'IntersectionObserver' in window;
  var rv = $$('.rv');
  if (io && !reduce) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); ro.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rv.forEach(function (el) { ro.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('seen'); });

  // ---------------- count-up numbers
  function fmt(el, v) { el.textContent = el.dataset.fmt === 'k' ? (v / 1000).toFixed(1) : Math.round(v).toLocaleString('en-US'); }
  $$('[data-countup]').forEach(function (box) {
    var nums = $$('[data-count]', box);
    if (!io || reduce) return;
    nums.forEach(function (el) { fmt(el, 0); });
    var o = new IntersectionObserver(function (es) {
      if (!es.some(function (e) { return e.isIntersecting; })) return;
      o.disconnect();
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / 1400), k = 1 - Math.pow(1 - p, 3);
        nums.forEach(function (el) { fmt(el, +el.dataset.count * k); });
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: .4 });
    o.observe(box);
  });

  // ---------------- missed-call calculators
  function money(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  $$('[data-calc]').forEach(function (box) {
    var miss = $('[data-k=miss]', box), val = $('[data-k=val]', box), rate = $('[data-k=rate]', box);
    var oMiss = $('[data-o=miss]', box), oVal = $('[data-o=val]', box), oRate = $('[data-o=rate]', box), big = $('[data-o=big]', box), year = $('[data-o=year]', box);
    function run() {
      var m = +miss.value, v = +val.value, r = +rate.value / 100;
      oMiss.textContent = m; oVal.textContent = money(v); oRate.textContent = rate.value + '%';
      var monthly = m * (52 / 12) * v * r;
      big.textContent = money(Math.round(monthly / 10) * 10);
      if (year) year.textContent = money(Math.round(monthly * 12 / 100) * 100);
    }
    [miss, val, rate].forEach(function (el) { el.addEventListener('input', run); });
    run();
  });

  // ---------------- sample conversations that play when they scroll in
  function playThread(card) {
    var thread = $('.thread', card);
    if (!thread._msgs) thread._msgs = $$('.m', thread).map(function (m) { return { cls: m.className.replace(/\bin\b/, '').trim(), html: m.innerHTML, text: m.textContent }; });
    var msgs = thread._msgs, timers = card._timers || [];
    timers.forEach(clearTimeout); card._timers = timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    thread.style.minHeight = thread.offsetHeight + 'px';
    thread.innerHTML = '';
    var t = 300;
    msgs.forEach(function (m) {
      var them = /\bthem\b/.test(m.cls), bee = /\bbee\b/.test(m.cls);
      later(function () {
        var d = document.createElement('div'); d.className = m.cls + ' in';
        if (them) { d.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; thread.appendChild(d); later(function () { d.innerHTML = m.html; }, 700); }
        else if (bee) { thread.appendChild(d); var n = 0; (function type() { n += 3; d.textContent = m.text.slice(0, n); if (n < m.text.length) later(type, 16); else d.innerHTML = m.html; })(); }
        else { d.innerHTML = m.html; thread.appendChild(d); }
      }, t);
      t += them ? 700 + 500 + m.text.length * 10 : bee ? 500 + m.text.length * 6 + 700 : 700;
    });
  }
  $$('.demo[data-replay]').forEach(function (card) {
    var btn = $('.replay', card);
    if (btn) btn.addEventListener('click', function () { playThread(card); });
    if (!io || reduce) return;
    var o = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { o.disconnect(); playThread(card); }
    }, { threshold: .35 });
    o.observe(card);
  });

  // ---------------- "a day on shift" lights up as you scroll
  $$('.day').forEach(function (day) {
    var items = $$('li', day);
    if (!io || reduce) { items.forEach(function (li) { li.classList.add('on'); }); return; }
    var o = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); o.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -30% 0px' });
    items.forEach(function (li) { o.observe(li); });
  });

  // ---------------- crew builder
  $$('[data-crew]').forEach(function (box) {
    var btns = $$('[data-bee]', box);
    var amt = $('[data-o=amt]', box), plan = $('[data-o=plan]', box), tip = $('[data-o=tip]', box), cta = $('[data-o=cta]', box);
    // Bea answers phones, which costs more to run, so she is $449 on her own; every other bee is $349.
    var SINGLE = { bea: 449 }, ONE = 349, CREW = 999, HIVE = 1690;
    var each = function (id) { return SINGLE[id] || ONE; };
    function price(ids) {
      var n = ids.length;
      var sorted = ids.map(each).sort(function (a, b) { return b - a; });
      var sum = sorted.reduce(function (a, v) { return a + v; }, 0);
      if (n <= 0) return { amt: 0, plan: 'Pick a bee to start', tip: 'Every bee does one job and is judged on one number.' };
      if (n === 1) return { amt: sum, plan: 'One bee', tip: ids[0] === 'bea' ? 'Bea is $449 because phone calls cost more to run. Any three bees are $999.' : 'Any three bees are $999 on the Crew plan.' };
      if (n === 2) return { amt: sum, plan: 'Two bees', tip: 'Add a third for ' + (CREW - sum > 0 ? '$' + (CREW - sum) + ' more' : 'no extra cost') + ': any three bees are $999.' };
      if (n === 3) return { amt: Math.min(CREW, sum), plan: 'Crew', tip: 'Three bees that hand work to each other' + (sum > CREW ? ', $' + (sum - CREW) + ' a month off.' : '.') };
      if (n === 4) { var a4 = CREW + sorted[3]; return { amt: a4, plan: 'Crew plus one', tip: 'Two more bees and the whole hive costs $' + (HIVE - a4) + ' more than this.' }; }
      if (n === 5) return { amt: HIVE, plan: 'Whole hive', tip: 'Five bees would cost more than six, so we put the whole hive on.' };
      return { amt: HIVE, plan: 'Whole hive', tip: 'All six bees, $504 a month off, with a priority Beekeeper.' };
    }
    function run() {
      var on = btns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; });
      var p = price(on.map(function (b) { return b.getAttribute('data-bee'); }));
      amt.innerHTML = p.amt ? '$' + p.amt.toLocaleString('en-US') + '<small>/mo</small>' : '$0<small>/mo</small>';
      plan.textContent = p.plan; tip.textContent = p.tip;
      if (cta) {
        var q = on.map(function (b) { return b.getAttribute('data-bee'); }).join(',');
        cta.setAttribute('href', 'book.html' + (q ? '?bees=' + q : ''));
      }
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); run(); }); });
    run();
  });

  // ---------------- long documents: highlight the section in view
  var toc = $('.doc-toc');
  if (toc && io) {
    var links = {};
    $$('a', toc).forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var o = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && links[e.target.id]) { Object.keys(links).forEach(function (k) { links[k].classList.toggle('on', k === e.target.id); }); } });
    }, { rootMargin: '-20% 0px -70% 0px' });
    $$('.doc h2[id]').forEach(function (h) { o.observe(h); });
  }
})();
