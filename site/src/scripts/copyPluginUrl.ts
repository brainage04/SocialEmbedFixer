const copyButton = document.querySelector<HTMLButtonElement>('#copy-plugin-url');
const pluginUrl = document.querySelector<HTMLElement>('#plugin-url');
const copyStatus = document.querySelector<HTMLElement>('#copy-status');

copyButton?.addEventListener('click', async () => {
  const text = pluginUrl?.textContent?.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (copyStatus) copyStatus.textContent = 'Plugin URL copied to clipboard.';
  } catch {
    if (copyStatus) copyStatus.textContent = 'Couldn’t copy automatically. Select the URL above.';
  }
});
