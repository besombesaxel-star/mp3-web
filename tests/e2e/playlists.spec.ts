import { expect, test } from "@playwright/test";

test("playlists page renders dynamic playlists and custom playlist form", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/playlists");

  await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible();
  await expect(page.getByText("Playlists dynamiques")).toBeVisible();
  await expect(page.getByPlaceholder("Nouvelle playlist...")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
