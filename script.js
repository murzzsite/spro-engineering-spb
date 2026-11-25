const LEAD_ENDPOINT = 'https://lead-relay.leestygpt.workers.dev/lead/RMQARYPYMG';
// Ссылка на бота-игру (гайд). После переноса бота на аккаунт клиента поменять только здесь.
const BOT_LINK = 'https://t.me/psv_mont_bot';

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/[  ]/g, ' ');

  $$('[data-bot]').forEach(a => { a.href = BOT_LINK; });
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ===== SCENE: схема дома по слоям =====
  const scene = $('#scheme');
  const layers = [0, 1, 2, 3].map(i => $('#L' + i));
  const stages = $$('.st', scene);
  const tabs = $$('#sceneTabs button');
  let activeStage = -1;
  const setActive = i => {
    if (i === activeStage) return;
    activeStage = i;
    stages.forEach((s, k) => s.classList.toggle('is-on', k === i));
    tabs.forEach((t, k) => { t.classList.toggle('is-on', k === i); t.setAttribute('aria-pressed', k === i); });
    layers.forEach((l, k) => { if (k > 0) l.style.opacity = k === i || k > i ? 1 : 0.4; });
  };
  const drawLayer = (l, d) => {
    $$('path[pathLength="1"]', l).forEach(p => { p.style.strokeDashoffset = (1 - d).toFixed(4); });
    const on = d > 0.85;
    $$('.pop', l).forEach(p => p.classList.toggle('in', on));
    $$('.flow, .ring', l).forEach(p => p.classList.toggle('in', on));
  };
  const sceneUpdate = () => {
    const r = scene.getBoundingClientRect();
    const total = scene.offsetHeight - $('.scene__stick').offsetHeight;
    const p = clamp(-r.top / total);
    layers.forEach((l, i) => drawLayer(l, clamp((p * 4 - i + 0.25) / 0.85)));
    setActive(Math.min(3, Math.floor(p * 4)));
  };
  if (!reduce && scene) {
    scene.classList.add('is-pin');
    tabs.forEach(t => t.addEventListener('click', () => {
      const i = +t.dataset.i;
      const total = scene.offsetHeight - $('.scene__stick').offsetHeight;
      const y = scene.getBoundingClientRect().top + scrollY + total * ((i + 0.5) / 4);
      scrollTo({ top: y, behavior: 'smooth' });
    }));
    setActive(0);
    sceneUpdate();
  }

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; if (scene.classList.contains('is-pin')) sceneUpdate(); });
  }, { passive: true });
  addEventListener('resize', () => { if (scene.classList.contains('is-pin')) sceneUpdate(); });

  // ===== CALCULATOR =====
  const PRICE_P = 4000, PRICE_H = 13500;
  const area = $('#area'), areaNum = $('#areaNum');
  const sum = $('#sum'), sumP = $('#sumP'), sumH = $('#sumH');
  const barP = $('#barP'), barH = $('#barH'), calcField = $('#calcField');
  let mode = 'both', shown = 0, anim = 0, touched = false;
  const LABEL = { power: 'Электромонтаж', heat: 'Отопление и водоснабжение', both: 'Электромонтаж + отопление и водоснабжение' };
  const calcUpdate = () => {
    const a = clamp(parseFloat(area.value) || 0, 30, 600);
    const p = mode === 'heat' ? 0 : a * PRICE_P;
    const h = mode === 'power' ? 0 : a * PRICE_H;
    const total = p + h;
    sumP.textContent = fmt(p) + ' ₽';
    sumH.textContent = fmt(h) + ' ₽';
    barP.style.width = (total ? p / total * 100 : 0) + '%';
    barH.style.width = (total ? h / total * 100 : 0) + '%';
    calcField.value = touched ? `${LABEL[mode]}, ${a} м², ориентир калькулятора ${fmt(total)} ₽` : '';
    cancelAnimationFrame(anim);
    const from = shown, t0 = performance.now(), dur = reduce ? 1 : 600;
    const step = t => {
      const k = clamp((t - t0) / dur);
      shown = from + (total - from) * (1 - Math.pow(1 - k, 3));
      sum.textContent = fmt(shown);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  area.addEventListener('input', () => { areaNum.value = area.value; touched = true; calcUpdate(); });
  areaNum.addEventListener('input', () => {
    const v = parseFloat(areaNum.value);
    if (!v) return;
    area.value = clamp(v, 30, 600); touched = true; calcUpdate();
  });
  areaNum.addEventListener('blur', () => { areaNum.value = clamp(parseFloat(areaNum.value) || 150, 30, 600); area.value = areaNum.value; calcUpdate(); });
  $$('[data-pill-item]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.k; touched = true; calcUpdate(); }));
  calcUpdate();

  // ===== smooth anchors =====
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href.length <= 1) return;
      const target = $(href);
      if (!target) return;
      e.preventDefault();
      const top = href === '#top' ? 0 : target.getBoundingClientRect().top + scrollY - 64;
      scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // ===== FORM -> CLOUDFLARE WORKER -> TELEGRAM =====
  const form = $('#leadForm');
  const msg = $('#formMsg');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    const fd = new FormData(form);
    const payload = {};
    fd.forEach((v, k) => { payload[k] = v; });
    if (payload._gotcha) return;
    msg.classList.remove('err');
    if (!payload.name || !payload.contact) { msg.textContent = 'Заполните имя и контакт'; msg.classList.add('err'); return; }
    if (!payload.consent) { msg.textContent = 'Нужно согласие на обработку персональных данных'; msg.classList.add('err'); return; }
    delete payload.consent;
    if (!payload.calc) delete payload.calc;
    payload.source = 'Теплый дом - лендинг';
    btn.disabled = true;
    btn.textContent = 'Отправляем...';
    try {
      const resp = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      btn.textContent = 'Отправлено';
      msg.textContent = 'Спасибо! Мы свяжемся с вами в ближайшее время.';
      form.reset();
    } catch (err) {
      console.error(err);
      btn.textContent = 'Ошибка, попробуйте ещё раз';
      msg.textContent = 'Не удалось отправить. Попробуйте ещё раз или напишите в Telegram @Spro0101.';
      msg.classList.add('err');
    } finally {
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000);
    }
  });
})();
