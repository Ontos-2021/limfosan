import { expect, test, type Browser, type Page } from '@playwright/test';

test.setTimeout(90000);

/** Dos navegadores reales contra el backend E2E (ver playwright.config.ts). */
async function twoPages(browser: Browser): Promise<[Page, Page]> {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  return [pageA, pageB];
}

async function closePages(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page
      .context()
      .close()
      .catch(() => undefined);
  }
}

function selects(page: Page) {
  return page.getByRole('button', { name: /Seleccionar/ });
}

function scoreLabel(page: Page) {
  return page.getByRole('region', { name: /Marcador/ });
}

/** Puntajes como [míos, del rival] según la perspectiva de cada página. */
async function scores(page: Page): Promise<[number, number]> {
  const label = (await scoreLabel(page).getAttribute('aria-label')) ?? '';
  const match = /(\d+), .* (\d+), a 30 puntos/.exec(label);
  if (!match) throw new Error(`marcador ilegible: ${label}`);
  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
}

async function playFirstCard(page: Page): Promise<void> {
  await selects(page).first().click();
  await page.getByRole('button', { name: 'Jugar carta' }).click();
}

/** A crea la mesa desde el lobby y devuelve el código. */
async function createTable(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: /Jugar online con un amigo/ }).click();
  await page.getByRole('button', { name: 'Crear mesa', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Esperando rival…' });
  await expect(heading).toBeVisible({ timeout: 15000 });
  const eyebrow = await page
    .locator('.felt .eyebrow')
    .filter({ hasText: 'MESA' })
    .first()
    .textContent();
  const code = /MESA ([A-Z0-9]{6})/.exec(eyebrow ?? '')?.[1];
  if (!code) throw new Error('sin código de mesa');
  return code;
}

test('dos navegadores juegan una mano completa online', async ({ browser }) => {
  const [pageA, pageB] = await twoPages(browser);
  try {
    const code = await createTable(pageA);
    await pageB.goto(`/?mesa=${code}`);

    // Ambos ven la partida en curso; sale A (mano).
    await expect(
      pageA.getByRole('button', { name: /Seleccionar/ }).first(),
    ).toBeEnabled({ timeout: 15000 });
    await expect(pageB.getByText('Turno de', { exact: false })).toBeVisible({
      timeout: 15000,
    });

    // A juega; B ve la carta sobre la mesa.
    await playFirstCard(pageA);
    await expect(pageB.locator('.trick.trick-played')).toHaveCount(1, {
      timeout: 10000,
    });

    // B responde; A ve la baza completa.
    await expect(selects(pageB).first()).toBeEnabled({ timeout: 10000 });
    await playFirstCard(pageB);
    await expect(
      pageA.locator('.trick.trick-played svg, .trick.trick-played img').first(),
    ).toBeVisible({
      timeout: 10000,
    });

    // Terminan la mano jugando; el marcador cambia en ambos.
    const before = await scoreLabel(pageA).getAttribute('aria-label');
    for (let i = 0; i < 8; i++) {
      const label = await scoreLabel(pageA).getAttribute('aria-label');
      if (label !== before) break;
      for (const page of [pageA, pageB]) {
        if ((await selects(page).count()) === 0) continue;
        if (
          !(await selects(page)
            .first()
            .isEnabled()
            .catch(() => false))
        )
          continue;
        await playFirstCard(page);
        await page.waitForTimeout(400);
      }
    }
    const after = await scores(pageA);
    const afterB = await scores(pageB);
    expect(after[0] + after[1]).toBeGreaterThan(0);
    expect(afterB).toEqual([after[1], after[0]]);
  } finally {
    await closePages([pageA, pageB]);
  }
});

test('mazo online termina la mano y suma al rival', async ({ browser }) => {
  const [pageA, pageB] = await twoPages(browser);
  try {
    const code = await createTable(pageA);
    await pageB.goto(`/?mesa=${code}`);
    await expect(selects(pageA).first()).toBeEnabled({ timeout: 15000 });

    await pageA
      .getByRole('button', { name: 'Ir al mazo', exact: true })
      .click();
    const dialog = pageA.getByRole('dialog');
    await expect(dialog.getByText('+1', { exact: false })).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Ir al mazo', exact: true })
      .click();

    await expect(scoreLabel(pageA)).toHaveAttribute(
      'aria-label',
      /Marcador: .* 0, .* 1, a 30 puntos/,
      { timeout: 10000 },
    );
    await expect(scoreLabel(pageB)).toHaveAttribute(
      'aria-label',
      /Marcador: .* 1, .* 0, a 30 puntos/,
      { timeout: 10000 },
    );
  } finally {
    await closePages([pageA, pageB]);
  }
});

test('recargar a mitad de partida recupera la misma mano', async ({
  browser,
}) => {
  const [pageA, pageB] = await twoPages(browser);
  try {
    const code = await createTable(pageA);
    await pageB.goto(`/?mesa=${code}`);
    await expect(selects(pageA).first()).toBeEnabled({ timeout: 15000 });
    await playFirstCard(pageA);
    await expect(selects(pageB).first()).toBeEnabled({ timeout: 10000 });

    const handBefore = await selects(pageB).allTextContents();
    await pageB.reload();
    await expect(selects(pageB).first()).toBeEnabled({ timeout: 15000 });
    const handAfter = await selects(pageB).allTextContents();
    expect(handAfter).toEqual(handBefore);

    // Y la partida sigue: B juega y A lo ve.
    await playFirstCard(pageB);
    await expect(pageA.locator('.trick.trick-played')).toHaveCount(1, {
      timeout: 10000,
    });
  } finally {
    await closePages([pageA, pageB]);
  }
});

test('abandono, revancha y mesa nueva entre ambos', async ({ browser }) => {
  const [pageA, pageB] = await twoPages(browser);
  try {
    const code = await createTable(pageA);
    await pageB.goto(`/?mesa=${code}`);
    await expect(selects(pageA).first()).toBeEnabled({ timeout: 15000 });

    // B sale a mitad de partida desde la app: A ve el fin por abandono.
    await pageB.getByRole('button', { name: /^Salir/ }).click();
    const finA = pageA.getByRole('dialog', { name: 'Fin de la partida' });
    await expect(finA).toBeVisible({ timeout: 15000 });
    await expect(finA.getByText(/abandonó/)).toBeVisible();

    // A pide revancha; B vuelve con el código viejo y también vota.
    await finA.getByRole('button', { name: /Pedir revancha/ }).click();
    await expect(finA.getByText(/Esperando al rival/)).toBeVisible();
    await pageB.goto(`/?mesa=${code}`);
    const finB = pageB.getByRole('dialog', { name: 'Fin de la partida' });
    await expect(finB).toBeVisible({ timeout: 15000 });
    await finB.getByRole('button', { name: /Pedir revancha/ }).click();

    // Ambos navegan a la mesa nueva y sigue el juego.
    await expect
      .poll(async () => new URL(pageA.url()).searchParams.get('mesa'), {
        timeout: 15000,
      })
      .not.toBe(code);
    await expect
      .poll(async () => new URL(pageB.url()).searchParams.get('mesa'), {
        timeout: 15000,
      })
      .not.toBe(code);
    const codeA = new URL(pageA.url()).searchParams.get('mesa');
    const codeB = new URL(pageB.url()).searchParams.get('mesa');
    expect(codeA).toBe(codeB);
    await expect(scoreLabel(pageA)).toHaveAttribute(
      'aria-label',
      /Marcador: .* 0, .* 0, a 30 puntos/,
      { timeout: 15000 },
    );
  } finally {
    await closePages([pageA, pageB]);
  }
});
