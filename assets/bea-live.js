// "Your turn: text Bea" — the live mode of the homepage demo card.
// Three engines, picked in this order:
//   1. sample: inside a claude.ai artifact viewer, Bea runs on Claude through
//      the artifact's `sample` capability, with page tools for the calendar.
//   2. api: on the deployed site, POST /api/bea (netlify/functions/bea.mjs).
//   3. offline: scripted replies, clearly labelled, when neither is there.
import { instructions, TOOLS, runTool, slots } from './bea-core.js';

const demo = document.getElementById('demo');
if (demo) init();

function init() {
  const $ = (id) => document.getElementById(id);
  const thread = $('thread'), tryBtn = $('tryBtn'), exitBtn = $('liveExit'), form = $('liveForm'), input = $('liveIn'), sugg = $('sugg'), how = $('liveHow');
  const send = form.querySelector('.send');
  const GREETING = "Hi, this is Bea, Harper Roofing's AI assistant. What's going on with your roof today?";
  const MAX_TURNS = 14;

  // start resolving the sample capability early; it asks the viewer nothing
  const samplePromise = (window.claude && typeof window.claude.use === 'function')
    ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);

  let live = false, mode = null, sample = null, noTools = false, ctl = null, epoch = 0;
  const state = { booked: [], turns: [], busy: false, count: 0 };

  // ---------------------------------------------------------------- ui helpers
  function scroll() { thread.scrollTop = thread.scrollHeight; }
  function add(kind, text, html) {
    const d = document.createElement('div');
    d.className = 'm in ' + kind;
    if (html) d.innerHTML = html; else d.textContent = text;
    thread.appendChild(d); scroll();
    return d;
  }
  function typing() { return add('bee', '', '<span class="dots"><i></i><i></i><i></i></span>'); }
  function setBusy(b) { state.busy = b; send.disabled = b || state.count >= MAX_TURNS; input.disabled = state.count >= MAX_TURNS; }
  function setHow() {
    how.textContent = mode === 'offline'
      ? "Offline demo: Bea's replies are scripted in this view. On the live site she runs on a real AI model."
      : "Bea is running on a real AI model with Harper Roofing's sample playbook. Bookings go on a pretend calendar.";
  }
  // renders a reply made of text rounds plus the events that happened between them
  function renderInto(holder, text, events) {
    holder.innerHTML = '';
    let last = 0;
    const parts = [];
    events.forEach((ev) => { parts.push({ t: text.slice(last, ev.pos) }); parts.push({ ev: ev.ev }); last = Math.max(last, ev.pos); });
    parts.push({ t: text.slice(last) });
    parts.forEach((p) => {
      if (p.ev) { const d = document.createElement('div'); d.className = 'm in ' + p.ev.kind; d.textContent = p.ev.text; holder.appendChild(d); return; }
      p.t.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
        const d = document.createElement('div'); d.className = 'm bee'; d.textContent = line; holder.appendChild(d);
      });
    });
    scroll();
  }
  function holderAfter(el) {
    const h = document.createElement('div');
    h.style.display = 'contents';
    el.replaceWith(h);
    return h;
  }

  // ---------------------------------------------------------------- engines
  async function pick() {
    const s = await Promise.race([samplePromise, new Promise((r) => setTimeout(() => r(null), 4000))]);
    if (s) {
      sample = s;
      try { const lim = await s.limits(); noTools = !!lim && !lim.tools; } catch (e) { noTools = false; }
      return 'sample';
    }
    if (window.BB && window.BB.api) return 'api';
    return 'offline';
  }

  function prompt() {
    let p = instructions();
    p += '\n\nYou already sent this greeting, so don\'t introduce yourself again: "' + GREETING + '"';
    if (noTools) {
      const open = slots(new Date(), state.booked).slice(0, 6).map((x) => x.id + ' = ' + x.label).join('; ');
      p += '\n\nTOOLS ARE OFF IN THIS VIEW. Open inspection times: ' + open + '. When you book one, end your message with a line "BOOKED|<slot id>|<name>". When you take a message for the office, end with "MESSAGE|<one line>". When you hand off to a person, end with "HANDOFF|urgent" or "HANDOFF|normal".';
    }
    p += '\n\nThe conversation so far follows.';
    return p;
  }

  async function viaSample(dots, my) {
    const holder = holderAfter(dots);
    const events = [];
    let seen = '';
    const tools = noTools ? undefined : TOOLS.map((t) => ({
      name: t.name, description: t.description, inputSchema: t.schema,
      execute: (inp) => { const r = runTool(t.name, inp, state); events.push({ pos: seen.length, ev: r.event }); renderInto(holder, seen, events); return r.result; },
    }));
    ctl = new AbortController();
    const msgs = [{ role: 'user', content: prompt() }, { role: 'assistant', content: GREETING }].concat(state.turns);
    const opts = { modelTier: 'quick', cache: false, signal: ctl.signal, onText: ({ text }) => { if (my !== epoch) return; seen = text; renderInto(holder, text, events); } };
    if (tools) opts.tools = tools;
    holder.appendChild(dots);           // keep the dots until the first words arrive
    try {
      const res = await sample(msgs, opts);
      if (my !== epoch) return;
      let text = res.text;
      if (noTools) text = parseTags(text, events);
      seen = text; renderInto(holder, text, events);
      state.turns.push({ role: 'assistant', content: text });
    } catch (e) {
      if (my !== epoch) return;
      const code = e && e.code;
      if (code === 'cancelled') return;
      holder.innerHTML = '';
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable', 'session_expired'].includes(code)) {
        if (code === 'tools_unavailable') { noTools = true; return viaSample(holder.appendChild(typing()), my); }
        mode = 'offline'; setHow();
        add('sys', 'Live AI is off in this view, so Bea is running the scripted demo');
        return viaOffline(holder.appendChild(typing()), my);
      }
      if (code === 'rate_limited') add('err', "Bea's getting a lot of messages right now. Try again in a minute.");
      else if (code === 'refused') add('err', "Bea can't help with that one. Try asking about the roof.");
      else add('err', 'That message didn\'t go through. Try sending it again.');
      state.turns.pop(); state.count--;
    }
  }

  function parseTags(text, events) {
    const lines = text.split('\n');
    const keep = [];
    lines.forEach((ln) => {
      const m = ln.trim().match(/^(BOOKED|MESSAGE|HANDOFF)\|(.*)$/);
      if (!m) { keep.push(ln); return; }
      const parts = m[2].split('|');
      if (m[1] === 'BOOKED') {
        try { const r = runTool('book_inspection', { slot_id: parts[0], name: parts[1] || 'Customer', phone: 'given', address: 'Dallas' }, state); events.push({ pos: 1e9, ev: r.event }); } catch (e) { /* ignore a bad tag */ }
      } else if (m[1] === 'MESSAGE') events.push({ pos: 1e9, ev: runTool('take_message', { message: parts.join(' ') }, state).event });
      else events.push({ pos: 1e9, ev: runTool('transfer_to_person', { reason: 'Asked for a person', urgency: parts[0] === 'urgent' ? 'urgent' : 'normal' }, state).event });
    });
    return keep.join('\n').trim();
  }

  async function viaApi(dots, my) {
    let d;
    try {
      const r = await fetch(window.BB.api + '/bea', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.turns, booked: state.booked, greeting: GREETING }),
      });
      d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.segments) throw Object.assign(new Error('bad response'), { status: r.status, d });
    } catch (e) {
      if (my !== epoch) return;
      dots.remove();
      if (e.status === 429) { add('err', (e.d && e.d.message) || "Bea's getting a lot of messages right now. Try again in a minute."); state.turns.pop(); state.count--; return; }
      mode = 'offline'; setHow();
      add('sys', 'Live AI is not connected here, so Bea is running the scripted demo');
      return viaOffline(typing(), my);
    }
    if (my !== epoch) return;
    dots.remove();
    state.booked = Array.isArray(d.booked) ? d.booked : state.booked;
    for (const seg of d.segments) {
      if (seg.type === 'event') add(seg.kind, seg.text);
      else String(seg.text || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).forEach((line) => add('bee', line));
      await new Promise((r) => setTimeout(r, 260));
    }
    state.turns.push({ role: 'assistant', content: d.reply || '' });
  }

  // scripted replies for views with no AI behind them
  const off = { slot: null, stage: 'start' };
  function viaOffline(dots, my) {
    const said = state.turns[state.turns.length - 1].content.toLowerCase();
    const open = slots(new Date(), state.booked);
    const a = open[0], b = open[1] || open[0];
    let reply, ev = null;
    const day = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'tomorrow', 'today'].find((w) => said.includes(w));
    if (/(real person|human|are you (a )?(bot|robot|ai)|is this a bot)/.test(said)) {
      reply = "No, I'm an AI assistant for Harper Roofing. I can book you in now, or have someone from the office call you back. Which would you like?";
    } else if (/(water coming|pouring|dripping|emergency|tree on|hole)/.test(said)) {
      reply = "I'm sorry, that sounds stressful. If it's safe, move anything valuable and put a bucket under the drip. I've texted our on-call crew lead, and they'll call you in a few minutes.";
      ev = runTool('transfer_to_person', { reason: 'Active leak', urgency: 'urgent' }, state).event;
    } else if (off.stage === 'details' && /\d{3}.*\d{4}/.test(said)) {
      const r = runTool('book_inspection', { slot_id: off.slot.id, name: 'Customer', phone: 'given', address: 'Dallas' }, state);
      reply = `Thanks! You're booked for ${off.slot.label}. You'll get a text tonight with your inspector's name.`;
      ev = r.event; off.stage = 'done';
    } else if (off.stage === 'offered' || day || /\b\d{1,2}(:\d{2})?\s?(am|pm)?\b/.test(said) || /(first|second|that works|sounds good|yes)/.test(said)) {
      off.slot = (day && open.find((x) => x.day.toLowerCase().startsWith(day.slice(0, 3)))) || (/second/.test(said) ? b : a);
      reply = `Great, I'll hold ${off.slot.label}. What's your name, mobile number and the property address?`;
      off.stage = 'details';
    } else if (/(insurance|claim|adjuster)/.test(said)) {
      reply = `Yes. We inspect, document the damage with photos and work with your adjuster. Approval is up to your insurance company. Want a free inspection? I have ${a.label} or ${b.label}.`;
      off.stage = 'offered';
    } else if (/(price|cost|how much|quote|estimate)/.test(said)) {
      reply = `Most repairs run $350 to $1,200, and replacements are quoted after a free inspection. Want me to book one? I have ${a.label} or ${b.label}.`;
      off.stage = 'offered';
    } else if (/(leak|storm|hail|damage|shingle|roof|gutter|inspection)/.test(said)) {
      reply = `Sorry to hear that. I can get an inspector out ${a.label} or ${b.label}. Which works better?`;
      off.stage = 'offered';
    } else {
      reply = 'I can help with inspections, repairs, replacements, storm damage and gutters. What\'s going on with your roof?';
    }
    return new Promise((res) => setTimeout(() => {
      if (my !== epoch) return res();
      dots.remove();
      if (ev && ev.kind === 'hand') add(ev.kind, ev.text);
      add('bee', reply);
      if (ev && ev.kind === 'res') add(ev.kind, ev.text);
      state.turns.push({ role: 'assistant', content: reply });
      res();
    }, 900 + Math.min(1400, reply.length * 8)));
  }

  // ---------------------------------------------------------------- flow
  async function say(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text || state.busy) return;
    if (state.count >= MAX_TURNS) return;
    const my = epoch;
    state.count++; setBusy(true);
    sugg.hidden = true;
    add('them', text);
    state.turns.push({ role: 'user', content: text });
    const dots = typing();
    try {
      if (!mode) { mode = await pick(); setHow(); }
      if (mode === 'sample') await viaSample(dots, my);
      else if (mode === 'api') await viaApi(dots, my);
      else await viaOffline(dots, my);
    } finally {
      if (my === epoch) {
        setBusy(false);
        if (state.count >= MAX_TURNS) add('sys', "That's the end of the demo. Book a call to see the rest of the hive");
        input.focus({ preventScroll: true });
      }
    }
  }

  function enter() {
    if (live) return;
    live = true; epoch++;
    if (window.BBDemo) { window.BBDemo.stop(); window.BBDemo.setHead('msg', 'Text Bea', 'Harper Roofing &middot; sample business', 'Live'); }
    demo.classList.add('is-live');
    thread.innerHTML = '';
    state.booked = []; state.turns = []; state.count = 0; off.stage = 'start';
    sugg.hidden = false;
    add('sys', "You're texting Harper Roofing");
    add('bee', GREETING);
    setHow(); setBusy(false);
    input.value = '';
    input.focus({ preventScroll: true });
    if (!mode) pick().then((m) => { mode = m; setHow(); });
  }
  function exit() {
    if (!live) return;
    live = false; epoch++;
    if (ctl) ctl.abort();
    demo.classList.remove('is-live');
    thread.innerHTML = '';
    setBusy(false);
    if (window.BBDemo) window.BBDemo.resume();
  }

  tryBtn.addEventListener('click', enter);
  exitBtn.addEventListener('click', exit);
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; say(v); });
  [].slice.call(sugg.querySelectorAll('button')).forEach((b) => b.addEventListener('click', () => say(b.textContent)));
  document.querySelectorAll('a[href="#try"], a[href="index.html#try"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); document.getElementById('try').scrollIntoView({ behavior: 'smooth', block: 'center' }); enter();
  }));
  if (location.hash === '#try') { setTimeout(() => { document.getElementById('try').scrollIntoView({ block: 'center' }); enter(); }, 400); }
}
