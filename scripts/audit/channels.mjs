// Use the same return-to-menu path as a player switching channels.
export async function openChannel(page, id) {
  const tile = id === 'online' ? page.locator('#onlineTab') : page.locator('.game-card[data-game="' + id + '"]');
  if (await page.locator('#playTab').isVisible()) await page.locator('#playTab').click();
  await tile.click();
}
