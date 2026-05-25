// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on zotero-plugin-template by windingwind (AGPL-3.0)

import { config } from "../../package.json";

const CSV_FIELD_ORDER = ["word", "translation", "sentence", "source"] as const;

const CSV_FIELD_DEFAULTS: Record<string, string> = {
  word: "Word",
  sentence: "Sentence",
  translation: "Translation",
  source: "Source",
};

const CSV_FIELD_LABELS: Record<string, string> = {
  word: "单词",
  sentence: "例句",
  translation: "释义",
  source: "来源",
};

export async function registerPrefsScripts(_window: Window) {
  addon.data.prefs = {
    window: _window,
    columns: [],
    rows: [],
  };

  bindPrefEvents();
  initCsvFieldConfig();
}

function getPrefValue(key: string): string {
  try {
    const value = Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true);
    return value !== undefined && value !== null ? String(value) : "";
  } catch {
    return "";
  }
}

function setPrefValue(key: string, value: string) {
  try {
    Zotero.Prefs.set(`${config.prefsPrefix}.${key}`, value, true);
  } catch (e) {
    ztoolkit.log(`Wordbook: failed to set pref ${key}: ${e}`);
  }
}

function getCsvFieldsConfig(): Array<{
  field: string;
  header: string;
  enabled: boolean;
}> {
  try {
    const configStr = getPrefValue("csvFieldConfig");
    if (configStr) {
      const parsed = JSON.parse(configStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Reorder to match the canonical order, preserving user's header/enabled state
        const fieldMap = new Map<string, any>(
          parsed.map((f: any) => [f.field, f]),
        );
        const reordered: any[] = [];
        for (const field of CSV_FIELD_ORDER) {
          const config = fieldMap.get(field);
          if (config) {
            reordered.push(config);
          }
        }
        // Append any extra fields not in the default order
        for (const f of parsed) {
          if (!CSV_FIELD_ORDER.includes(f.field as any)) {
            reordered.push(f);
          }
        }
        return reordered;
      }
    }
  } catch (e) {
    ztoolkit.log(`Wordbook: failed to parse csvFieldConfig: ${e}`);
  }

  return CSV_FIELD_ORDER.map((field) => ({
    field,
    header: CSV_FIELD_DEFAULTS[field],
    enabled: true,
  }));
}

function saveCsvFieldsConfig(
  fields: Array<{ field: string; header: string; enabled: boolean }>,
) {
  try {
    setPrefValue("csvFieldConfig", JSON.stringify(fields));
    ztoolkit.log("Wordbook: csvFieldConfig saved successfully");
  } catch (e) {
    ztoolkit.log(`Wordbook: failed to save csvFieldConfig: ${e}`);
  }
}

function createSelectionRow(
  doc: Document,
  field: string,
  enabled: boolean,
): HTMLElement {
  const wrapper = doc.createElement("div");
  wrapper.style.cssText =
    "display: flex; align-items: center; gap: 4px; height: 28px;";

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = enabled;
  checkbox.dataset.field = field;
  checkbox.id = `csv-select-${field}`;
  checkbox.style.cssText = "margin: 0;";
  wrapper.appendChild(checkbox);

  const label = doc.createElement("label");
  label.textContent = CSV_FIELD_LABELS[field];
  label.htmlFor = `csv-select-${field}`;
  label.style.cssText = "font-size: 13px; cursor: pointer;";
  wrapper.appendChild(label);

  return wrapper;
}

function createOrderRow(
  doc: Document,
  field: string,
  header: string,
  index: number,
  total: number,
): HTMLElement {
  const row = doc.createElement("div");
  row.style.cssText =
    "display: flex; align-items: center; gap: 8px; margin: 4px 0;";
  row.dataset.field = field;

  // Up/Down buttons side by side
  const btnContainer = doc.createElement("div");
  btnContainer.style.cssText =
    "display: flex; gap: 2px; width: 40px; align-items: center;";

  const upBtn = doc.createElement("button");
  upBtn.textContent = "▲";
  upBtn.style.cssText =
    "padding: 0 2px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; font-size: 10px; color: #333; line-height: 1; height: 20px; width: 18px; border-radius: 0;";
  upBtn.title = "上移";
  if (index === 0) {
    upBtn.style.opacity = "0.3";
    upBtn.style.cursor = "default";
    upBtn.disabled = true;
  }
  btnContainer.appendChild(upBtn);

  const downBtn = doc.createElement("button");
  downBtn.textContent = "▼";
  downBtn.style.cssText =
    "padding: 0 2px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; font-size: 10px; color: #333; line-height: 1; height: 20px; width: 18px; border-radius: 0;";
  downBtn.title = "下移";
  if (index === total - 1) {
    downBtn.style.opacity = "0.3";
    downBtn.style.cursor = "default";
    downBtn.disabled = true;
  }
  btnContainer.appendChild(downBtn);

  row.appendChild(btnContainer);

  const label = doc.createElement("label");
  label.textContent = CSV_FIELD_LABELS[field];
  label.style.cssText = "width: 60px; font-size: 13px;";
  row.appendChild(label);

  const input = doc.createElement("input");
  input.type = "text";
  input.value = header;
  input.dataset.field = field;
  input.style.cssText =
    "flex: 1; height: 28px; border: 1px solid #ccc; border-radius: 0; padding: 2px 6px; font-size: 13px;";
  row.appendChild(input);

  // Bind events
  upBtn.addEventListener("click", () => {
    if (index > 0) {
      moveField(index, index - 1);
    }
  });

  downBtn.addEventListener("click", () => {
    if (index < total - 1) {
      moveField(index, index + 1);
    }
  });

  return row;
}

function moveField(fromIndex: number, toIndex: number) {
  const doc = addon.data.prefs?.window.document;
  if (!doc) return;

  const fields = getCsvFieldsConfig();
  if (
    fromIndex < 0 ||
    fromIndex >= fields.length ||
    toIndex < 0 ||
    toIndex >= fields.length
  ) {
    return;
  }

  const [moved] = fields.splice(fromIndex, 1);
  fields.splice(toIndex, 0, moved);
  saveCsvFieldsConfig(fields);
  renderOrderSection(doc);
}

function renderSelectionSection(doc: Document) {
  const container = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-csv-fields-selection`,
  );
  if (!container) return;

  container.innerHTML = "";
  const fields = getCsvFieldsConfig();

  fields.forEach(({ field, enabled }) => {
    const row = createSelectionRow(doc, field, enabled);
    container.appendChild(row);
  });

  // Bind change events for selection checkboxes
  container
    .querySelectorAll('input[type="checkbox"]')
    .forEach((cb: Element) => {
      cb.addEventListener("change", () => {
        const fields = getCsvFieldsConfig();
        const changedField = (cb as HTMLInputElement).dataset.field;
        const fieldConfig = fields.find((f) => f.field === changedField);
        if (fieldConfig) {
          fieldConfig.enabled = (cb as HTMLInputElement).checked;
          saveCsvFieldsConfig(fields);
          // Re-render order section to reflect selection changes
          renderOrderSection(doc);
        }
      });
    });
}

function renderOrderSection(doc: Document) {
  const container = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-csv-fields-order`,
  );
  if (!container) return;

  container.innerHTML = "";
  const fields = getCsvFieldsConfig();
  const enabledFields = fields.filter((f) => f.enabled);

  if (!enabledFields.length) {
    const emptyMsg = doc.createElement("div");
    emptyMsg.textContent = "请至少选择一个字段";
    emptyMsg.style.cssText =
      "color: #999; font-size: 13px; font-style: italic;";
    container.appendChild(emptyMsg);
    return;
  }

  enabledFields.forEach(({ field, header }, index) => {
    const row = createOrderRow(doc, field, header, index, enabledFields.length);
    container.appendChild(row);
  });

  // Bind change events for header inputs
  container.querySelectorAll('input[type="text"]').forEach((inp: Element) => {
    const saveHandler = () => {
      const fields = getCsvFieldsConfig();
      const changedField = (inp as HTMLInputElement).dataset.field;
      const fieldConfig = fields.find((f) => f.field === changedField);
      if (fieldConfig) {
        fieldConfig.header =
          (inp as HTMLInputElement).value ||
          CSV_FIELD_DEFAULTS[changedField || ""];
        saveCsvFieldsConfig(fields);
      }
    };
    inp.addEventListener("change", saveHandler);
    inp.addEventListener("blur", saveHandler);
  });
}

function toggleCsvFieldsVisibility(doc: Document, show: boolean) {
  const container = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-csv-fields-container`,
  ) as HTMLElement | null;
  if (container) {
    container.style.display = show ? "block" : "none";
  }
}

function initCsvFieldConfig() {
  const doc = addon.data.prefs?.window.document;
  if (!doc) return;

  renderSelectionSection(doc);
  renderOrderSection(doc);

  const menulist = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-export-format`,
  ) as XUL.MenuList | null;

  if (menulist) {
    setTimeout(() => {
      toggleCsvFieldsVisibility(doc, menulist.value === "anki-csv");
    }, 0);

    menulist.addEventListener("command", () => {
      toggleCsvFieldsVisibility(doc, menulist.value === "anki-csv");
    });
  }
}

function bindPrefEvents() {
  addon.data.prefs?.window.document
    ?.querySelector(
      `#zotero-prefpane-${config.addonRef}-target-highlight-color`,
    )
    ?.addEventListener("change", (event: Event) => {
      const input = event.target as HTMLInputElement;
      ztoolkit.log(
        `Wordbook: target highlight color changed to ${input.value}`,
      );
    });

  const menulist = addon.data.prefs?.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-export-format`,
  ) as XUL.MenuList | null;

  menulist?.addEventListener("command", () => {
    ztoolkit.log(`Wordbook: export format changed to ${menulist.value}`);
  });
}
