// The command bar, as the capture and the between-shot reset both drive it. Only the active tab
// renders one, so a caller that has just switched tabs waits for it here rather than assuming it.
const COMMAND_BAR = '.command textarea';

export function commandBar(page) {
  return page.locator(COMMAND_BAR);
}

export async function typeCommand(page, text) {
  const input = commandBar(page);
  await input.waitFor({ state: 'visible' });
  await input.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

// Empties whatever the last shot left half-typed (the tab-completion and ghost-text shots both
// photograph an unsubmitted command). `fill` sets the value and fires the input event React's
// controlled textarea listens for, so the ghost-text suggestion clears with it.
export async function clearCommandBar(page) {
  await commandBar(page).fill('');
}
