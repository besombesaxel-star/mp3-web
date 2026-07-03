import { expect, test } from "@playwright/test";
import { promises as fs } from "fs";
import path from "path";

const audioDir = path.join(process.cwd(), "public", "audio");
const fixtureSrc = path.join(process.cwd(), "tests", "e2e", "fixtures", "sample.mp3");
const testFileName = "e2e-radio-track.mp3";
const testFilePath = path.join(audioDir, testFileName);

test.describe("radio", () => {
  test.beforeAll(async () => {
    await fs.mkdir(audioDir, { recursive: true });
    await fs.copyFile(fixtureSrc, testFilePath);
  });

  test.afterAll(async () => {
    await fs.rm(testFilePath, { force: true });
  });

  test("le bouton Radio de l'accueil lance une file et joue un morceau", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();

    const radioButton = page.getByRole("button", { name: /Radio/ });
    await expect(radioButton).toBeVisible({ timeout: 15000 });
    await radioButton.click();

    const miniPlayer = page.locator('[aria-label="Mini lecteur"]');
    await expect(miniPlayer).toBeVisible();
    await expect(miniPlayer.getByTitle("Pause").last()).toBeVisible({ timeout: 10000 });

    expect(pageErrors).toEqual([]);
  });
});
