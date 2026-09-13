// Small helpers shared by the browser-automation marketplace modules.
// These sites change their markup often, so every helper fails soft
// (logs a warning, keeps going) rather than aborting the whole post over
// one optional field that couldn't be found.

async function safeFill(locator, value, warnings, label) {
  if (value === undefined || value === null || value === "") return;
  try {
    await locator.waitFor({ state: "visible", timeout: 5000 });
    await locator.fill(String(value));
  } catch (err) {
    warnings.push(`Could not fill "${label}": ${err.message.split("\n")[0]}`);
  }
}

async function safeClick(locator, warnings, label) {
  try {
    await locator.waitFor({ state: "visible", timeout: 5000 });
    await locator.click();
  } catch (err) {
    warnings.push(`Could not click "${label}": ${err.message.split("\n")[0]}`);
  }
}

async function safeSetFiles(locator, files, warnings, label) {
  try {
    await locator.waitFor({ state: "attached", timeout: 5000 });
    await locator.setInputFiles(files);
  } catch (err) {
    warnings.push(`Could not attach photos ("${label}"): ${err.message.split("\n")[0]}`);
  }
}

module.exports = { safeFill, safeClick, safeSetFiles };
