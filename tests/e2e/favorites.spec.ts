import { expect, test } from "@playwright/test";

test("favorites page sanitizes corrupted legacy localStorage entries", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://127.0.0.1:3000",
          localStorage: [
            {
              name: "mp3:favorites:v1",
              value: JSON.stringify({
                broken: null,
                legacy: {
                  title: "Song",
                  src: "/audio/song.mp3",
                },
              }),
            },
          ],
        },
      ],
    },
  });

  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/favorites");

  await expect(page.getByRole("heading", { name: "Favoris" })).toBeVisible();
  await expect(page.getByText("Song")).toBeVisible();
  await expect(page.getByText("1 morceau")).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("mp3:favorites:v1") ?? "{}";
        return Object.keys(JSON.parse(raw)).sort().join(",");
      })
    )
    .toBe("/audio/song.mp3");

  expect(pageErrors).toEqual([]);

  await context.close();
});
