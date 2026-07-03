import { expect, test } from "@playwright/test";
import { promises as fs } from "fs";
import path from "path";

const audioDir = path.join(process.cwd(), "public", "audio");
const fixtureSrc = path.join(process.cwd(), "tests", "e2e", "fixtures", "sample.mp3");
const testFileName = "e2e-test-track.mp3";
const testFilePath = path.join(audioDir, testFileName);
const trackTitle = "e2e test track";

test.describe("lecture locale", () => {
  test.beforeAll(async () => {
    await fs.mkdir(audioDir, { recursive: true });
    await fs.copyFile(fixtureSrc, testFilePath);
  });

  test.afterAll(async () => {
    await fs.rm(testFilePath, { force: true });
  });

  test("un morceau local apparait dans la bibliotheque et se lit", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Bibliotheque" })).toBeVisible();

    const playButton = page.getByRole("button", { name: `Lire ${trackTitle}` });
    await expect(playButton).toBeVisible({ timeout: 15000 });
    await playButton.click();

    const miniPlayer = page.locator('[aria-label="Mini lecteur"]');
    await expect(miniPlayer).toBeVisible();
    await expect(miniPlayer.getByText(trackTitle).last()).toBeVisible();
    await expect(miniPlayer.getByTitle("Pause").last()).toBeVisible({ timeout: 10000 });

    expect(pageErrors).toEqual([]);
  });
});
