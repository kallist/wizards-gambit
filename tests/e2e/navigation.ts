import { expect, type Page } from "@playwright/test";

/** Use the same visible house and table entrances as a player. */
export async function openTable(page: Page) {
  const hub = page.getByTestId("cottage-hub");
  await expect(hub).toBeVisible();
  if ((await hub.getAttribute("data-state")) === "cover")
    await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  const closeChat = page.getByRole("button", { name: "收起聊天", exact: true });
  if (await closeChat.isVisible()) await closeChat.click();
  if (!(await page.getByRole("region", { name: "选择棋局" }).isVisible()))
    await page.getByRole("button", { name: "打开棋桌", exact: true }).click();
  await expect(page.getByRole("region", { name: "选择棋局" })).toBeVisible();
}
