import { expect, test } from "@playwright/test";

test("home page renders and can navigate to search", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recemment ajoutes" })).toBeVisible();

  await page.getByRole("link", { name: "Recherche" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { name: "Recherche" })).toBeVisible();
});
