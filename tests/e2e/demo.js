// Browser run of the PRD §12 demo script (Playwright, Chromium).
// Usage: BASE=http://localhost:8000 node tests/e2e/demo.js   (needs the 'playwright' package)
// Calls the live AI for the paste step. Resets the demo first. Screenshots go to SHOTS (default /tmp/biai-shots/).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8014';
const S = (process.env.SHOTS || '/tmp/biai-shots') + '/';
require('fs').mkdirSync(S, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('dialog', d => d.accept());
  const step = async (name, fn) => { const t = Date.now(); try { await fn(); console.log('OK  ', name, `(${Date.now()-t} ms)`); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await p.screenshot({ path: S + 'fail-' + name.replace(/\W+/g,'_') + '.png' }); } try { await close(); } catch {} };
  const col = s => p.getByTestId('column-' + s);
  const card = (status, name) => col(status).locator('[data-testid^=card-]').filter({ hasText: name }).first();
  const close = async () => { if (await drawer().count()) { await p.keyboard.press('Escape'); await drawer().waitFor({ state: 'detached' }); } };
  const replyText = () => drawer().getByRole('textbox', { name: 'Reply text' });
  const drawer = () => p.getByRole('dialog', { name: 'Contact details' });

  // Reset from inside the page (the browser uses the network proxy; Playwright's request API may not).
  await p.goto(BASE);
  await p.evaluate(async () => {
    await fetch('/api/demo/reset', { method: 'POST' });
    await fetch('/api/demo/clock', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo_now: '2026-10-28T12:00' }) });
  });
  await step('1 board loads: 17 in pipeline, 2 not a lead', async () => {
    await p.goto(BASE); await p.getByText('in the pipeline').waitFor();
    const n = await p.locator('[data-testid^=column-] [data-testid^=card-]').count();
    if (n !== 17) throw new Error('pipeline cards ' + n);
    const tray = await p.getByRole('region', { name: 'Not a lead' }).innerText();
    if (!/Not a lead\s*2/.test(tray)) throw new Error(tray.slice(0, 80));
    console.log('     header:', await p.getByTestId('urgent-count').innerText(), '|', await p.getByTestId('overdue-count').innerText(), '|', await p.getByTestId('demo-now').innerText());
    await p.screenshot({ path: S + '1-board.png' });
  });
  await step('1b not-a-lead tray opens', async () => {
    await p.getByRole('button', { name: /Not a lead/ }).click();
    const tray = p.getByRole('region', { name: 'Not a lead' });
    await tray.getByText('Arif Hossain', { exact: true }).waitFor();
    console.log('     tray:', (await tray.innerText()).replace(/\s+/g, ' ').slice(0, 160));
  });
  await step('2 open Habibur: urgent, call script', async () => {
    await card('Paid', 'Habibur Rahman').click();
    await drawer().getByText('Call script').waitFor();
    const t = await drawer().innerText() + await replyText().inputValue();
    for (const s of ['Refund', 'May post publicly', 'Opening:', 'Overdue']) if (!t.includes(s)) throw new Error('missing ' + s);
    await p.screenshot({ path: S + '2-habibur.png' });
  });
  await step('3 Rafi: merged timeline, Banglish reply, mark sent -> Contacted', async () => {
    await card('New', 'Rafi Ahmed').click();
    const d = drawer(); await d.getByText('Asked again.').waitFor();
    const t = await d.innerText();
    if ((t.match(/from Rafi Ahmed/g) || []).length !== 2) throw new Error('timeline messages');
    if (!(await d.getByRole('button', { name: 'Banglish' }).getAttribute('aria-pressed'))) throw new Error('lang');
    await p.screenshot({ path: S + '3-rafi.png' });
    await d.getByRole('button', { name: 'Mark as sent' }).click();
    await d.getByText('Reply sent').first().waitFor();
    await close();
    await card('Contacted', 'Rafi Ahmed').waitFor();
  });
  await step('4 live paste: Bangla company sample', async () => {
    await p.getByRole('button', { name: 'Paste message' }).click();
    const m = p.getByRole('dialog', { name: 'Paste a message' });
    await m.getByRole('button', { name: /বাংলা · company/ }).click();
    await m.getByRole('button', { name: 'Analyse with AI' }).click();
    await m.getByText('Check what the AI found').waitFor({ timeout: 60000 });
    const ts = await m.getByLabel('Team size').inputValue().catch(() => '');
    console.log('     team size:', ts, '| priority:', await m.locator('select').nth(4).inputValue().catch(()=>'?'), '| text:', (await m.getByText(/New contact/).innerText().catch(()=> '')).slice(0,60));
    await p.screenshot({ path: S + '4-analyse.png', fullPage: true });
    await m.getByRole('button', { name: 'Save contact' }).click();
    await drawer().getByText('Nusrat Jahan', { exact: false }).first().waitFor();
    await drawer().getByRole('textbox', { name: 'Reply text' }).waitFor({ timeout: 60000 });
    const body = await drawer().getByRole('textbox', { name: 'Reply text' }).inputValue();
    if (!/[ঀ-৿]/.test(body)) throw new Error('reply not Bangla: ' + body.slice(0, 60));
    await p.screenshot({ path: S + '4-new-contact.png' });
  });
  await step('4b switch to Banglish (live)', async () => {
    await card('New', 'Nusrat Jahan').click();
    const d = drawer(); await replyText().waitFor({ timeout: 60000 });
    await d.getByRole('button', { name: 'Banglish' }).click();
    await d.getByText('Writing a reply').waitFor({ state: 'detached', timeout: 60000 });
    const body = await d.getByRole('textbox', { name: 'Reply text' }).inputValue();
    if (/[ঀ-৿]/.test(body) || body.length < 20) throw new Error('banglish? ' + body.slice(0, 60));
    console.log('     ', body.slice(0, 110));
    await p.screenshot({ path: S + '4b-banglish.png' });
  });
  await step('5 #17 certificate: not govt approved, FAQ chip', async () => {
    await card('New', 'Nowshin').click();
    const d = drawer(); await replyText().waitFor();
    const body = await replyText().inputValue();
    if (!/not|\bna\b|নয়/i.test(body)) throw new Error(body);
    await d.getByText('certificate', { exact: true }).waitFor();
    await d.getByText(/Demo FAQ, placeholder values/).waitFor();
  });
  await step('6 drag Samira New -> Interested', async () => {
    await card('New', 'Samira').dragTo(col('Interested'));
    await card('Interested', 'Samira').waitFor();
  });
  await step('7 filters: corporate + overdue toggle', async () => {
    await p.getByLabel('Interests').selectOption('corporate');
    const n = await p.locator('[data-testid^=column-] [data-testid^=card-]').count();
    await p.getByRole('button', { name: 'Clear filters' }).click();
    await p.getByTestId('overdue-count').click();
    const o = await p.locator('[data-testid^=column-] [data-testid^=card-]').count();
    await p.getByTestId('overdue-count').click();
    console.log('     corporate cards:', n, '| overdue-only cards:', o);
    if (n !== 4) throw new Error('corporate ' + n);
  });
  await step('8 edit a field clears the AI-unsure mark; add note', async () => {
    await card('New', 'Nusrat Jahan').click();
    const d = drawer(); await d.getByRole('heading', { name: 'Details' }).waitFor();
    const unsure = await d.getByText('AI unsure, please check').count();
    await d.getByLabel(/Company/).fill('Tejgaon Pharma Ltd');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await d.getByRole('button', { name: 'Save changes' }).and(p.locator(':disabled')).waitFor();
    const after = await d.getByText('AI unsure, please check').count();
    console.log('     unsure marks after editing company:', after);
    await d.getByPlaceholder('Add a note…').fill('Called, sending proposal');
    await d.getByRole('button', { name: 'Add' }).click();
    await d.getByText('Called, sending proposal').waitFor();
    console.log('     unsure marks before edit:', unsure);
  });
  await step('9 demo clock -> 26 Oct 10:00 lowers overdue', async () => {
    const before = await p.getByTestId('overdue-count').innerText();
    await p.getByTestId('demo-now').click();
    await p.getByLabel('Demo time').fill('2026-10-26T10:00');
    await p.getByRole('button', { name: 'Set', exact: true }).click();
    await p.getByText('Mon 26 Oct').waitFor();
    console.log('     overdue before/after:', before, '/', await p.getByTestId('overdue-count').innerText());
  });
  await step('10 reset demo', async () => {
    await p.getByRole('button', { name: 'Reset demo' }).click();
    await card('New', 'Rafi Ahmed').waitFor();
    const n = await p.locator('[data-testid^=column-] [data-testid^=card-]').count();
    if (n !== 17) throw new Error('after reset ' + n);
  });
  console.log('console errors:', errs.length ? errs : 'none');
  await b.close();
})();
