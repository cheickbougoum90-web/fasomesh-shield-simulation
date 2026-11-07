/**
 * Vérification visuelle (§10) : ouvre l'application dans un vrai navigateur
 * (Chromium/Playwright), visite les écrans sur ORDinateur (1280×900) et
 * TÉLÉPHONE (390×844), capture les images dans artifacts/screens et remonte
 * les erreurs console ainsi que les débordements horizontaux.
 *
 * Un navigateur ISELÉ est relancé pour chaque écran : l'environnement
 * headless de cette machine peut planter au bout de quelques captures.
 *
 *   LD_LIBRARY_PATH=$PWD/.local/libs/usr/lib/x86_64-linux-gnu node tools/visual-check.mjs
 *   (le serveur dev doit tourner sur :5173)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const PWD = 'fasomesh';
const errors = [];
const overflow = [];
const captured = [];

/** Écrans visités : nom de fichier, compte, route, format. */
const SCREENS = [
  { name: '01-connexion', route: '/auth' },
  { name: '02-tableau-de-bord-csps', account: 'agent_csps', route: '/app' },
  { name: '03-demandes', account: 'agent_csps', route: '/app/care' },
  { name: '04-formulaire-reference', account: 'agent_csps', route: '/app/care/new' },
  { name: '05-fiche-dossier', account: 'agent_csps', route: '/app/care', openFirst: true },
  { name: '06-annuaire', account: 'agent_csps', route: '/app/directory' },
  { name: '07-espace-centre', account: 'agent_centre_reference', route: '/app/centre' },
  { name: '08-espace-hub', account: 'operateur_hub', route: '/app/hub' },
  { name: '09-equipe-csps', account: 'responsable_csps', route: '/app/team' },
  { name: '10-rapports', account: 'responsable_csps', route: '/app/reports' },
  { name: '11-parametres', account: 'responsable_csps', route: '/app/settings' },
  { name: 'm01-tableau-de-bord', account: 'agent_csps', route: '/app', mobile: true },
  { name: 'm02-demandes', account: 'agent_csps', route: '/app/care', mobile: true },
  { name: 'm03-formulaire', account: 'agent_csps', route: '/app/care/new', mobile: true },
  { name: 'm04-espace-centre', account: 'agent_centre_reference', route: '/app/centre', mobile: true },
  { name: 'm05-espace-hub', account: 'operateur_hub', route: '/app/hub', mobile: true },
];

async function login(page, account) {
  await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(700);
  // Puce du compte de démonstration : remplit identifiant + mot de passe.
  await page.click(`button:text-is("${account}")`);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app', { timeout: 15_000 });
  await page.waitForTimeout(700);
}

async function capture(screen) {
  const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
  try {
    const context = await browser.newContext({
      viewport: screen.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      isMobile: !!screen.mobile,
      hasTouch: !!screen.mobile,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${screen.name} · pageerror : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${screen.name} · console : ${m.text()}`);
    });

    if (screen.account) await login(page, screen.account);
    else {
      await page.goto(`${BASE}${screen.route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(700);
    }

    if (screen.route !== '/auth') {
      await page.goto(`${BASE}${screen.route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(1300);
    }

    if (screen.openFirst) {
      const first = page.locator('a[href^="/app/care/"]:not([href*="/new"])').first();
      if ((await first.count()) === 0) throw new Error('aucun lien de fiche dossier sur /app/care');
      await first.click();
      await page.waitForTimeout(900);
    }

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (hasOverflow) overflow.push(`${screen.name} (${screen.mobile ? 390 : 1280}px)`);
    await page.screenshot({ path: `artifacts/screens/${screen.name}.png` });
    captured.push(screen.name);
    console.log(`✓ ${screen.name}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

for (const screen of SCREENS) {
  try {
    await capture(screen);
  } catch (e) {
    errors.push(`${screen.name} : ${e.message.split('\n')[0]}`);
    console.log(`✗ ${screen.name} — ${e.message.split('\n')[0]}`);
  }
}

console.log('\n── Rapport ─────────────────────────────');
console.log(`captures : ${captured.length}/${SCREENS.length}`);
console.log(`erreurs console : ${errors.length}`);
for (const e of errors) console.log('  ✗ ' + e);
console.log(`débordements horizontaux : ${overflow.length}`);
for (const o of overflow) console.log('  ✗ ' + o);
process.exit(errors.length || overflow.length ? 1 : 0);
