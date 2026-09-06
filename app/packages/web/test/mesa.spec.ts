import { expect, test, type Page } from '@playwright/test';

// Partida determinista: ?seed=7 reparte siempre las mismas cartas.
// Flujo conocido: la CPU acepta el truco, gana la mano 1 (0–1) y abre
// truco en la mano 2. Los tests juegan esa línea salvo indicación.
async function gotoSeed(page: Page) {
  await page.goto('/?seed=7');
}

/**
 * Espera a que la mesa se estabilice: turno propio accionable, diálogo
 * visible o marcador cambiado. La CPU puede jugar dos veces seguidas
 * (gana una baza y sale en la siguiente), así que no hay tiempo fijo.
 */
async function waitSettled(
  page: Page,
  initial: string | null,
): Promise<string> {
  const deadline = Date.now() + 20000;
  for (;;) {
    if ((await page.getByRole('dialog').count()) > 0) return 'dialog';
    const label = await scoreLabel(page).getAttribute('aria-label');
    if (label !== initial) return `score:${label}`;
    const cards = selects(page);
    if ((await cards.count()) > 0 && (await cards.first().isEnabled())) {
      return 'turn';
    }
    if (Date.now() > deadline) {
      throw new Error('La mesa no se estabilizó a tiempo');
    }
    await page.waitForTimeout(250);
  }
}

function selects(page: Page) {
  return page.getByRole('button', { name: /Seleccionar/ });
}

function scoreLabel(page: Page) {
  return page.getByRole('region', { name: /Marcador/ });
}

async function playFirstCard(page: Page) {
  await selects(page).first().click();
  await page.getByRole('button', { name: 'Jugar carta' }).click();
}

/** Juega cartas hasta que el marcador cambie (mano terminada) o aparezca un diálogo. */
async function playUntilScore(page: Page, initial: string | null) {
  for (let i = 0; i < 10; i++) {
    const state = await waitSettled(page, initial);
    if (state !== 'turn') break;
    await playFirstCard(page);
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { app: 'truquito', status: 'ok', version: 'test' } }),
  );
  await gotoSeed(page);
});

test('mesa real: cartas propias, rival oculto y marcador en cero', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Un buen truco.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Jugás contra la CPU', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Jugar carta' }),
  ).toBeDisabled();
  await expect(selects(page)).toHaveCount(3);
  await expect(
    page.getByRole('img', { name: /cartas ocultas/ }),
  ).toHaveAttribute('aria-label', 'Rival (CPU): 3 cartas ocultas');
  await expect(scoreLabel(page)).toHaveAttribute(
    'aria-label',
    'Marcador: vos 0, CPU 0, a 30 puntos',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (test.info().project.name === 'mobile-chromium') {
    const bounds = await page
      .getByRole('button', { name: 'Jugar carta' })
      .boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  for (const image of await page.locator('img.card-face').all()) {
    await expect
      .poll(
        () =>
          image.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        { timeout: 5000 },
      )
      .toBeGreaterThan(0);
  }
  for (const face of await page.locator('svg.card-face').all()) {
    const box = await face.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  }
  await page.screenshot({
    path: `test-results/mesa-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('truco propio aceptado + envido rechazado suman de verdad', async ({
  page,
}) => {
  const initial = await scoreLabel(page).getAttribute('aria-label');
  await page.getByRole('button', { name: 'Truco 2' }).click();
  await waitSettled(page, initial);
  await expect(page.getByText('Mano: 2 puntos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Envido', exact: true }).click();
  await page.getByRole('button', { name: 'Envido 2' }).click();
  await waitSettled(page, initial);
  await expect(scoreLabel(page)).toHaveAttribute(
    'aria-label',
    'Marcador: vos 1, CPU 0, a 30 puntos',
  );
  await expect(selects(page).first()).toBeEnabled();
});

test('mano completa y respuesta al truco de la CPU', async ({ page }) => {
  const initial = await scoreLabel(page).getAttribute('aria-label');
  await playUntilScore(page, initial);
  await expect(scoreLabel(page)).toHaveAttribute(
    'aria-label',
    'Marcador: vos 0, CPU 1, a 30 puntos',
  );
  // Mano 2: la CPU es mano y abre truco.
  const overlay = page.getByRole('dialog', { name: 'Responder canto' });
  await expect(overlay).toBeVisible({ timeout: 20000 });
  await expect(overlay.getByRole('heading', { name: '¡Truco!' })).toBeVisible();
  await overlay.getByRole('button', { name: '¡Quiero!' }).click();
  await expect(page.getByText('Mano: 2 puntos', { exact: true })).toBeVisible();
  await playFirstCard(page);
  await waitSettled(page, 'Marcador: vos 0, CPU 1, a 30 puntos');
  const played = page
    .getByLabel('Cartas jugadas en esta mano')
    .locator('.card-face');
  expect(await played.count()).toBeGreaterThan(0);
});

test('rechazar el truco de la CPU le da su punto', async ({ page }) => {
  const initial = await scoreLabel(page).getAttribute('aria-label');
  await playUntilScore(page, initial);
  const overlay = page.getByRole('dialog', { name: 'Responder canto' });
  await expect(overlay).toBeVisible({ timeout: 20000 });
  await overlay.getByRole('button', { name: 'No quiero' }).click();
  await expect(scoreLabel(page)).toHaveAttribute(
    'aria-label',
    'Marcador: vos 0, CPU 2, a 30 puntos',
  );
  await expect(selects(page)).toHaveCount(3);
});

test('reconexión simulada pausa y restaura la partida', async ({ page }) => {
  await page.getByRole('button', { name: 'Explorar estados' }).click();
  await page.getByRole('button', { name: 'Reconexión' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tu lugar sigue acá.' }),
  ).toBeVisible();
  await expect(selects(page).first()).toBeDisabled();
  await page.getByRole('button', { name: 'Simular regreso' }).click();
  await expect(selects(page).first()).toBeEnabled();
  // La partida real no se alteró: sigue 0 a 0 con 3 cartas.
  await expect(scoreLabel(page)).toHaveAttribute(
    'aria-label',
    'Marcador: vos 0, CPU 0, a 30 puntos',
  );
  await expect(selects(page)).toHaveCount(3);
});

test('ayuda, teclado y mazo real con confirmación', async ({ page }) => {
  await page.getByRole('button', { name: 'Cómo jugar', exact: true }).click();
  const help = page.getByRole('dialog');
  await expect(help).toBeVisible();
  await expect(
    help.getByText('2 / 3 / 4 puntos', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cómo jugar', exact: true }),
  ).toBeFocused();
  const card = selects(page).first();
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ir al mazo', exact: true }).click();
  const leave = page.getByRole('dialog');
  await expect(leave.getByText('+1', { exact: false })).toBeVisible();
  await leave.getByRole('button', { name: 'Seguir jugando' }).click();
  await expect(selects(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Ir al mazo', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Ir al mazo', exact: true })
    .click();
  await expect(scoreLabel(page)).toHaveAttribute(
    'aria-label',
    'Marcador: vos 0, CPU 1, a 30 puntos',
  );
  await expect(selects(page)).toHaveCount(3);
});

test('baraja: clásica por defecto, SVG en los dieces y propia alternable', async ({
  page,
}) => {
  // Con ?seed=5 la mano es 1-oro, 10-basto y 12-basto: el PNG heredado
  // no tiene dieces, así que el 10 se dibuja con el SVG propio.
  await page.goto('/?seed=5');
  await expect(page.getByRole('button', { name: /Seleccionar/ })).toHaveCount(
    3,
  );
  await expect(page.locator('.hand-cards img.card-face')).toHaveCount(2);
  await expect(page.locator('.hand-cards svg.card-face')).toHaveCount(1);
  await expect(
    page.getByLabel('Baraja clásica. Cambiar a la baraja propia'),
  ).toBeVisible();

  await page.getByRole('button', { name: /Baraja clásica/ }).click();
  await expect(page.locator('.hand-cards svg.card-face')).toHaveCount(3);
  await expect(page.locator('.hand-cards img.card-face')).toHaveCount(0);
  await expect(
    page.getByLabel('Baraja propia. Cambiar a la baraja clásica'),
  ).toBeVisible();

  await page.getByRole('button', { name: /Baraja propia/ }).click();
  await expect(page.locator('.hand-cards img.card-face')).toHaveCount(2);
  await expect(page.locator('.hand-cards svg.card-face')).toHaveCount(1);
});

test('movimiento reducido y fallo de health no bloquean el juego', async ({
  page,
}) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await gotoSeed(page);
  await expect(
    page.getByText('Sin servicio · partida local disponible'),
  ).toBeVisible();
  expect(
    await page
      .locator('.hand-card')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await selects(page).first().click();
  await expect(page.getByRole('button', { name: 'Jugar carta' })).toBeEnabled();
});
