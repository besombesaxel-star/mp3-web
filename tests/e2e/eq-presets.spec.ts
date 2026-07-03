import { expect, test } from "@playwright/test";

test("le preset egaliseur personnalise affiche des sliders reglables", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Parametres" })).toBeVisible();

  await page.getByRole("button", { name: "Perso" }).click();

  const slider90 = page.getByLabel("Gain 90 Hz");
  await expect(slider90).toBeVisible();
  await slider90.fill("6");
  await expect(slider90).toHaveValue("6");

  await page.getByRole("button", { name: "Reinitialiser" }).click();
  await expect(slider90).toHaveValue("0");

  expect(pageErrors).toEqual([]);
});
