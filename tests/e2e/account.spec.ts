import { expect, test } from "@playwright/test";

test("la page compte se degrade proprement sans backend Supabase configure", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "Compte" })).toBeVisible();
  await expect(page.getByText("Supabase Auth n'est pas configuré.")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
