import { expect, test } from "@playwright/test";

test("le wizard d'upload est bloque tant qu'on n'est pas connecte", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Upload" })).toBeVisible();

  // Non connecte: le bandeau d'invite doit etre visible et la selection de fichier desactivee.
  await expect(page.getByText("Connecte-toi dans")).toBeVisible();
  await expect(page.locator("#audio-input")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();

  expect(pageErrors).toEqual([]);
});
