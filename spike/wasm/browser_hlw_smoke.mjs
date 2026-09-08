import puppeteer from 'puppeteer-core';

const chrome = process.env.CHROME;
const url = process.env.OPENREALM_URL;
if (!chrome || !url) throw new Error('CHROME and OPENREALM_URL are required');

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
});

try {
  const page = await browser.newPage();
  await page.setViewport({width: 1100, height: 760, deviceScaleFactor: 1});
  const lines = [];
  page.on('console', msg => {
    const line = `[hlw:${msg.type()}] ${msg.text()}`;
    lines.push(line);
    console.log(line);
  });
  page.on('pageerror', err => {
    const line = `[hlw:pageerror] ${err.message}`;
    lines.push(line);
    console.error(line);
  });

  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.waitForFunction(() =>
    window.Module && typeof window.Module._HLW_GetGold === 'function' &&
    document.getElementById('hlw-hud'), {timeout: 30000});
  await page.waitForFunction(() => window.Module._HLW_GetGold() === 80, {timeout: 10000});

  const state = async () => page.evaluate(() => ({
    gold: Module._HLW_GetGold(),
    income: Module._HLW_GetIncome(),
    enemyIncome: Module._HLW_GetEnemyIncome(),
    lives: Module._HLW_GetLives(0),
    enemyLives: Module._HLW_GetLives(1),
    level: Module._HLW_GetHeroLevel(0),
    heroX10: Module._HLW_GetHeroX10(),
    playerLane: Module._HLW_GetCreepCount(0),
    enemyLane: Module._HLW_GetCreepCount(1),
    nova: Module._HLW_GetNovaCooldown(),
    game: Module._HLW_GetGameState(),
  }));

  const initial = await state();
  if (initial.gold !== 80 || initial.income !== 20 || initial.lives !== 20 || initial.enemyLives !== 20 || initial.level !== 1) {
    throw new Error(`Unexpected initial HLW state: ${JSON.stringify(initial)}`);
  }

  // Sending must immediately spend gold, increase future income and create a
  // creep in the enemy line through the authoritative server simulation.
  await page.keyboard.press('1');
  await new Promise(r => setTimeout(r, 250));
  const afterSend = await state();
  if (afterSend.gold !== 70 || afterSend.income !== 22 || afterSend.enemyLane < 1) {
    throw new Error(`Runner send contract failed: ${JSON.stringify(afterSend)}`);
  }

  // The hero is actually controllable rather than a scripted smoke marker.
  const beforeMove = afterSend.heroX10;
  await page.keyboard.down('d');
  await new Promise(r => setTimeout(r, 650));
  await page.keyboard.up('d');
  await new Promise(r => setTimeout(r, 150));
  const afterMove = await state();
  if (afterMove.heroX10 <= beforeMove + 20) {
    throw new Error(`Hero movement did not advance: before=${beforeMove} after=${afterMove.heroX10}`);
  }

  // Q is a real server ability with cooldown, even when cast before a creep is
  // in range. That makes the input/cooldown boundary independently observable.
  await page.keyboard.press('q');
  await new Promise(r => setTimeout(r, 150));
  const afterNova = await state();
  if (afterNova.nova <= 0) throw new Error(`Nova cooldown did not arm: ${JSON.stringify(afterNova)}`);

  // The AI must participate in the same send/income system and populate the
  // player's line; this proves there is an opponent loop, not just buttons.
  await page.waitForFunction(() => Module._HLW_GetCreepCount(0) > 0, {timeout: 7000});
  const afterAI = await state();
  if (afterAI.enemyIncome <= 20 || afterAI.playerLane <= 0) {
    throw new Error(`AI send loop failed: ${JSON.stringify(afterAI)}`);
  }

  // Let at least one ten-second income boundary pass. Player gold must rise by
  // the post-send income amount unless combat rewards make it even higher.
  await page.waitForFunction(() => Module._HLW_GetIncomeCountdown() <= 1, {timeout: 12000});
  const beforeIncome = await state();
  await new Promise(r => setTimeout(r, 1800));
  const afterIncome = await state();
  if (afterIncome.gold < beforeIncome.gold + 22) {
    throw new Error(`Income tick failed: before=${JSON.stringify(beforeIncome)} after=${JSON.stringify(afterIncome)}`);
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText.includes('RUNNER') || !bodyText.includes('JUGGERNAUT') || !bodyText.includes('HERO LINE WARS')) {
    throw new Error('Hero Line Wars HUD/control surface missing');
  }
  if (!lines.some(line => line.includes('HERO_LINE_WARS_KERNEL=READY'))) {
    throw new Error('Authoritative kernel ready marker missing');
  }
  if (!lines.some(line => line.includes('HERO_LINE_WARS_BOARD=PASS'))) {
    throw new Error('Hero Line Wars renderer board marker missing');
  }
  if (lines.some(line => /abort\(|OPENREALM_ABORT=|RuntimeError|unreachable/i.test(line))) {
    throw new Error('Runtime abort observed during HLW browser smoke');
  }

  console.log(`HERO_LINE_WARS_BROWSER_EVIDENCE=${JSON.stringify({initial, afterSend, afterMove, afterNova, afterAI, beforeIncome, afterIncome})}`);
  console.log('HERO_LINE_WARS_BROWSER_SMOKE=PASS');
} finally {
  await browser.close();
}
