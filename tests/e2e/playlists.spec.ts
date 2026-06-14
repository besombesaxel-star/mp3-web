import { expect, test } from "@playwright/test";

test("playlists page stays stable with legacy local favorites", async ({ browser }) => {
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

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/playlists");

  await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible();
  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = localStorage.getItem("mp3:favorites:v1") ?? "{}";
      return Object.keys(JSON.parse(raw)).sort().join(",");
    });
  }).toBe("/audio/song.mp3");

  expect(pageErrors).toEqual([]);

  await context.close();
});
