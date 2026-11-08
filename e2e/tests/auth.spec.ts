import { test, expect } from '@playwright/test';

/**
 * End-to-end flows against the running stack (web:5173, api:4000, db:5432).
 */

const email = `e2e-${Date.now()}@example.com`;
const password = 'e2e-supersecret1';

test.describe('authentication', () => {
  test('register → dashboard → logout → login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole('button', { name: /Need an account/ }).click();
    await page.getByPlaceholder('Your name').fill('E2E Tester');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder(/Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Overview')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder(/Password/).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Overview')).toBeVisible();
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('nobody@example.com');
    await page.getByPlaceholder(/Password/).fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.error')).toBeVisible();
  });

  test('dashboard is protected', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
