// Browser run of the PRD §12 demo flow on the redesigned UI (Playwright, Chromium).
// Usage: BASE=http://localhost:8000 node tests/e2e/demo.js   (needs the 'playwright' package)
// Calls the live AI for the paste step and the weekly summary. Resets the demo first.
// Screenshots go to SHOTS (default /tmp/biai-shots/).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000';
const S = (process.env.SHOTS || '/tmp/biai-shots') + '/';
require('fs').mkdirSync(S, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  let failed = 0;

  const panel = () => p.getByRole('dialog', { name: 'Contact details' });
  const close = async () => {
    if (await panel().count()) {
      await p.keyboard.press('Escape');
      await panel().waitFor({ state: 'detached' });
    }
  };
  const step = async (name, fn) => {
    const t = Date.now();
    try {
      await fn();
      console.log('OK  ', name, `(${Date.now() - t} ms)`);
    } catch (e) {
      failed++;
      console.log('FAIL', name, e.message.split('\n')[0]);
      await p.screenshot({ path: S + 'fail-' + name.replace(/\W+/g, '_') + '.png' });
    }
    try {
      await close();
    } catch {}
  };
  const nav = (name) => p.getByRole('navigation', { name: 'Main' }).getByRole('button', { name });
  const col = (s) => p.getByTestId('column-' + s);
  const card = (status, name) => col(status).locator('[data-testid^=card-]').filter({ hasText: name }).first();
  const replyText = () => panel().getByRole('textbox', { name: 'Reply text' });
  const cards = () => p.locator('[data-testid^=column-] [data-testid^=card-]');
  const search = async (q) => {
    const box = p.getByRole('textbox', { name: 'Search contacts' });
    await box.fill(q);
    await p.locator('[data-radix-popper-content-wrapper]').getByText(q, { exact: false }).first().waitFor();
    await box.press('Enter');
    await panel().waitFor();
  };

  // Reset from inside the page (the browser uses the network proxy; Playwright's request API may not).
  await p.goto(BASE);
  await p.evaluate(async () => {
    await fetch('/api/demo/reset', { method: 'POST' });
  });
  await p.evaluate(() => localStorage.clear());
  await p.reload();

  await step('1 Today: status line, KPIs, queue, AI brief (seeded, no AI call)', async () => {
    await p.goto(BASE + '/#today');
    const h = await p.getByTestId('today-headline').innerText();
    if (!h.includes('7 people are overdue and 2 are urgent')) throw new Error(h);
    if (!(await p.getByTestId('kpi-waiting').innerText()).includes('17')) throw new Error('waiting kpi');
    const rows = await p.getByTestId('queue').getByRole('listitem').count();
    if (rows !== 17) throw new Error('queue rows ' + rows);
    const top2 = (await p.getByTestId('queue').getByRole('listitem').allInnerTexts()).slice(0, 2).join(' | ');
    // Both urgent and overdue; the tie goes to the longest wait (Rafi since Mon 09:12, Habibur since Tue 12:30)
    if (!/Rafi Ahmed[\s\S]*Habibur Rahman/.test(top2)) throw new Error('queue top two ' + top2.slice(0, 80));
    await p.getByTestId('brief').waitFor();
    await p.screenshot({ path: S + '1-today.png' });
  });

  await step('1a Pipeline fits the screen; 17 cards; columns scroll; Not a lead tab', async () => {
    await nav('Pipeline').click();
    await col('New').waitFor();
    const n = await cards().count();
    if (n !== 17) throw new Error('cards ' + n);
    const pageScroll = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    if (pageScroll > 2) throw new Error('page scrolls by ' + pageScroll);
    if (!(await p.getByTestId('column-scroll-New').evaluate((e) => e.scrollHeight > e.clientHeight))) throw new Error('New column does not scroll');
    await p.screenshot({ path: S + '1a-board.png' });
    await p.getByRole('tab', { name: /Not a lead/ }).click();
    const t = await p.getByTestId('contact-table').innerText();
    if (!t.includes('Arif Hossain')) throw new Error('not a lead table');
    await p.getByRole('tab', { name: /Pipeline/ }).click();
  });

  await step('1b sort: priority first (default) vs overdue first, remembered on reload', async () => {
    const top = async () => (await col('New').locator('[data-testid^=card-]').first().innerText()).split('\n')[0];
    const names = async () => (await col('New').locator('[data-testid^=card-]').allInnerTexts()).map((t) => t.split('\n')[0]);
    const before = async (a, b) => { const n = await names(); return n.findIndex((x) => x.includes(a)) < n.findIndex((x) => x.includes(b)); };
    const radio = (n) => p.getByRole('radio', { name: n });
    if ((await radio('Priority first').getAttribute('aria-checked')) !== 'true') throw new Error('default');
    if (!(await top()).includes('Rafi Ahmed')) throw new Error('priority top ' + (await top()));
    if (!(await before('Kamrul Islam', 'Tahmina Akter'))) throw new Error('priority: high should beat medium overdue');
    await radio('Overdue first').click();
    if (!(await top()).includes('Rafi Ahmed')) throw new Error('overdue top ' + (await top()));  // urgent + overdue
    if (!(await before('Tahmina Akter', 'Kamrul Islam'))) throw new Error('overdue: medium overdue should beat high not overdue');
    await p.reload();
    await col('New').waitFor();
    if ((await radio('Overdue first').getAttribute('aria-checked')) !== 'true') throw new Error('not remembered');
    await radio('Priority first').click();
  });

  await step('1c filter chips + table view', async () => {
    await p.getByRole('button', { name: 'Filter' }).click();
    await p.getByRole('button', { name: 'Corporate', exact: true }).click();
    await p.keyboard.press('Escape');
    const n = await cards().count();
    if (n !== 3) throw new Error('corporate cards ' + n);
    await p.getByRole('button', { name: 'Remove filter Corporate' }).click();
    await p.getByRole('radio', { name: 'Table' }).click();
    const rows = await p.getByTestId('contact-table').locator('tbody tr').count();
    if (rows !== 17) throw new Error('table rows ' + rows);
    await p.screenshot({ path: S + '1c-table.png' });
    await p.getByRole('radio', { name: 'Board' }).click();
  });

  await step('2 Habibur from the queue: call script, flags; previous arrow steps to Rafi', async () => {
    await nav('Today').click();
    await p.getByTestId('queue').getByRole('listitem').filter({ hasText: 'Habibur Rahman' }).getByRole('button', { name: 'Call', exact: true }).click();
    await panel().getByText('Call script').waitFor();
    const all = (await panel().innerText()) + (await replyText().inputValue());
    for (const s of ['refund', 'may post publicly', 'opening:', 'call note by staff']) if (!all.toLowerCase().includes(s)) throw new Error('missing ' + s);
    await p.screenshot({ path: S + '2-habibur.png' });
    if ((await panel().getByTestId('queue-position').innerText()) !== '2 of 17') throw new Error('Habibur position');
    await panel().getByRole('button', { name: /Previous contact/ }).click();
    await panel().getByRole('heading', { name: 'Rafi Ahmed' }).waitFor();
    const pos = await panel().getByTestId('queue-position').innerText();
    if (pos !== '1 of 17') throw new Error('position ' + pos);
  });

  await step('3 Rafi: two messages + merge line, Banglish reply with apology, Mark as sent -> Contacted', async () => {
    await nav('Pipeline').click();
    await card('New', 'Rafi Ahmed').click();
    const conv = panel().getByLabel('Conversation');
    await conv.waitFor();
    const t = await conv.innerText();
    if ((t.match(/WhatsApp · Rafi Ahmed/g) || []).length !== 2) throw new Error('two messages');
    if (!t.includes('merged into this contact')) throw new Error('merge line');
    const props = await panel().getByLabel('Details').innerText();
    if (!/50 h overdue/.test(props)) throw new Error('Rafi should be 50 h overdue: ' + props.slice(0, 120));
    if ((await panel().getByRole('button', { name: 'Banglish' }).getAttribute('aria-pressed')) !== 'true') throw new Error('language');
    if (!/dukkhito|sorry|deri/i.test(await replyText().inputValue())) throw new Error('no apology');
    await p.screenshot({ path: S + '3-rafi.png' });
    await panel().getByRole('button', { name: 'Mark as sent' }).click();
    await conv.getByText('You · marked as sent').waitFor();
    await p.getByRole('status').filter({ hasText: 'moved to Contacted' }).waitFor();
    await close();
    await card('Contacted', 'Rafi Ahmed').waitFor();
  });

  await step('4 New enquiry: Bangla company sample -> AI fields -> save -> Bangla reply (live)', async () => {
    await p.getByRole('button', { name: 'New enquiry' }).click();
    const m = p.getByRole('dialog', { name: 'New enquiry' });
    await m.getByRole('button', { name: /বাংলা · company/ }).click();
    await m.getByRole('button', { name: 'Analyse with AI' }).click();
    await m.getByText('Check what the AI found').waitFor({ timeout: 90000 });
    const ts = await m.getByLabel('Team size').inputValue();
    if (ts !== '30') throw new Error('team size ' + ts);
    if (!(await m.innerText()).includes('01988765432')) throw new Error('phone from Bangla digits');
    await p.screenshot({ path: S + '4-intake.png' });
    await m.getByRole('button', { name: 'Save contact' }).click();
    await panel().getByRole('heading', { name: 'Nusrat Jahan' }).waitFor();
    await replyText().waitFor({ timeout: 90000 });
    const body = await replyText().inputValue();
    if (!/[ঀ-৿]/.test(body)) throw new Error('reply not Bangla');
    await p.screenshot({ path: S + '4-new-contact.png' });
  });

  await step('4b switch the reply to Banglish (live)', async () => {
    await search('Nusrat');
    await replyText().waitFor({ timeout: 60000 });
    await panel().getByRole('button', { name: 'Banglish' }).click();
    await panel().getByText('Writing a reply').waitFor({ state: 'detached', timeout: 90000 });
    const body = await replyText().inputValue();
    if (/[ঀ-৿]/.test(body) || body.length < 20) throw new Error('banglish? ' + body.slice(0, 60));
  });

  await step('5 search Nowshin: certificate reply says not government approved', async () => {
    await search('Nowshin');
    const body = await replyText().inputValue();
    if (!/\bnot\b|\bna\b|\bnoy\b|\bnoi\b|নয়/i.test(body)) throw new Error(body);
    await panel().getByText('certificate', { exact: true }).waitFor();
    await panel().getByText('Demo FAQ, placeholder values').waitFor();
  });

  await step('6 drag Samira New -> Interested', async () => {
    await nav('Pipeline').click();
    await card('New', 'Samira').dragTo(col('Interested'));
    await card('Interested', 'Samira').waitFor();
  });

  await step('7 click-to-edit a property and add a note', async () => {
    await search('Nusrat');
    await panel().getByRole('button', { name: 'Edit Company' }).click();
    await panel().getByRole('textbox', { name: 'Company' }).fill('Tejgaon Pharma Ltd');
    await panel().getByRole('button', { name: 'Save', exact: true }).click();
    await panel().getByText('Tejgaon Pharma Ltd').first().waitFor();
    await panel().getByLabel('Add a note').fill('Called, sending proposal');
    await panel().getByRole('button', { name: 'Add', exact: true }).click();
    await panel().getByLabel('Conversation').getByText('Called, sending proposal').waitFor();
  });

  await step('8 demo clock -> 26 Oct 10:00: nobody overdue yet', async () => {
    await nav('Today').click();
    await p.getByTestId('demo-now').click();
    await p.getByLabel('Demo time').fill('2026-10-26T10:00');
    await p.getByRole('button', { name: 'Set demo time' }).click();
    await p.getByTestId('demo-now').filter({ hasText: 'Mon 26 Oct' }).waitFor();
    const k = await p.getByTestId('kpi-waiting').innerText();
    if (!k.includes('0 overdue')) throw new Error(k);
  });

  await step('9 Reports: data changed -> generate weekly summary live, numbers checked', async () => {
    await nav('Reports').click();
    await p.getByRole('button', { name: 'Generate weekly summary' }).click();
    await p.getByTestId('summary-overview').waitFor({ timeout: 90000 });
    if (await p.getByText('Check: these numbers are not in the computed figures').count()) throw new Error('unverified numbers');
    await p.screenshot({ path: S + '9-reports.png' });
  });

  await step('10 reset demo data (in-page confirm) restores data and clock', async () => {
    await p.getByRole('button', { name: 'Reset demo data' }).click();
    await p.getByRole('button', { name: 'Reset', exact: true }).click();
    await p.getByRole('status').filter({ hasText: 'Demo data reset' }).waitFor();
    await nav('Today').click();
    const h = await p.getByTestId('today-headline').innerText();
    if (!h.includes('7 people are overdue and 2 are urgent')) throw new Error(h);
  });

  console.log('console errors:', errs.length ? errs : 'none');
  await b.close();
  process.exit(failed || errs.length ? 1 : 0);
})();
