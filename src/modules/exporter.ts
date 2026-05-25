// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on zotero-plugin-template by windingwind (AGPL-3.0)

import type { HighlightAnnotationDebugInfo } from "./annotations";
import {
  collectAttachmentHighlights,
  collectCurrentHighlightAnnotations,
  getSelectedItemsWithAttachments,
  type ItemWithAttachments,
} from "./annotations";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { config } from "../../package.json";

type ExportFormat = "bbdc-txt" | "anki-csv";

function normalizeColor(color: string): string {
  return color.trim().toLowerCase();
}

function normalizeWord(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function createBbdcTxt(words: string[]): string {
  return words.join("\n") + (words.length ? "\n" : "");
}

interface WordbookEntry {
  word: string;
  sentence: string;
  translation: string;
  source: string;
}

interface CsvField {
  field: "word" | "sentence" | "translation" | "source";
  header: string;
  enabled: boolean;
}

function getDefaultCsvFields(): CsvField[] {
  return [
    { field: "word", header: "Word", enabled: true },
    { field: "translation", header: "Translation", enabled: true },
    { field: "sentence", header: "Sentence", enabled: true },
    { field: "source", header: "Source", enabled: true },
  ];
}

function getCsvFields(): CsvField[] {
  try {
    const prefValue = Zotero.Prefs.get(
      `${config.prefsPrefix}.csvFieldConfig`,
      true,
    ) as string;
    if (prefValue) {
      const parsed = JSON.parse(prefValue) as CsvField[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback to defaults
  }
  return getDefaultCsvFields();
}

function createCsv(entries: WordbookEntry[]): string {
  if (!entries.length) {
    return "";
  }
  const fields = getCsvFields().filter((f) => f.enabled);
  if (!fields.length) {
    return "";
  }

  const header = fields.map((f) => toCsvCell(f.header)).join(",");
  const rows = entries.map((entry) =>
    fields.map((f) => toCsvCell(entry[f.field])).join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

function createDefaultFilename(format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const ext = format === "bbdc-txt" ? "txt" : "csv";
  return `wordbook-${date}.${ext}`;
}

function getFilePickerFilters(format: ExportFormat): [string, string][] {
  if (format === "bbdc-txt") {
    return [["Text File (*.txt)", "*.txt"]];
  }
  return [["CSV File (*.csv)", "*.csv"]];
}

async function showExportConfirmDialog(
  win: Window,
  itemsWithAttachments: ItemWithAttachments[],
): Promise<ItemWithAttachments[] | false> {
  if (!itemsWithAttachments.length) {
    return [];
  }

  const dialogData: {
    _lastButtonId?: string;
    unloadLock: {
      promise: Promise<void>;
      resolve: () => void;
      reject: () => void;
    };
  } = {
    unloadLock: Zotero.Promise.defer(),
  };

  const rows = itemsWithAttachments.length + 3;
  const dialog = new ztoolkit.Dialog(rows, 2);

  dialog.addCell(
    0,
    0,
    {
      tag: "h2",
      namespace: "html",
      properties: {
        innerHTML: getString("dialog-title"),
        style: "margin: 8px 0 4px 0;",
      },
    },
    true,
  );

  dialog.addCell(
    1,
    0,
    {
      tag: "p",
      namespace: "html",
      properties: {
        innerHTML: getString("dialog-description", {
          args: { count: String(itemsWithAttachments.length) },
        }),
        style:
          "margin: 4px 0; color: #666; display: block; width: 100%; white-space: nowrap;",
      },
    },
    true,
  );

  dialog.addCell(
    2,
    0,
    {
      tag: "hr",
      namespace: "html",
      properties: {
        style:
          "width: 100%; border: none; border-top: 1px solid #ddd; display: block; margin: 8px 0;",
      },
    },
    true,
  );

  itemsWithAttachments.forEach(({ item }, i) => {
    const row = i + 3;
    const title = (item.getField("title") as string) || "Untitled";

    dialog.addCell(
      row,
      0,
      {
        tag: "input",
        namespace: "html",
        attributes: {
          type: "checkbox",
          checked: "true",
          id: `wordbook-item-${item.id}`,
        },
        properties: { style: "margin-right: 6px;" },
      },
      false,
    );

    dialog.addCell(
      row,
      1,
      {
        tag: "label",
        namespace: "html",
        attributes: {
          for: `wordbook-item-${item.id}`,
        },
        properties: {
          innerHTML: title,
          style:
            "font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 300px;",
          title: title,
        },
      },
      false,
    );
  });

  dialog
    .addButton(getString("dialog-confirm"), "confirm")
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("dialog-title"));

  await dialogData.unloadLock.promise;

  if (dialogData._lastButtonId !== "confirm") {
    return false;
  }

  const selected: ItemWithAttachments[] = [];
  for (const entry of itemsWithAttachments) {
    const checkboxId = `wordbook-item-${entry.item.id}`;
    const isChecked = (dialogData as any)[checkboxId];
    if (isChecked !== false && isChecked !== "false") {
      selected.push(entry);
    }
  }

  return selected;
}

async function performExport(
  win: _ZoteroTypes.MainWindow,
  highlights: HighlightAnnotationDebugInfo[],
): Promise<number | false> {
  const targetColor = normalizeColor(
    getPref("targetHighlightColor") || "#aaaaaa",
  );
  const format = (getPref("exportFormat") || "bbdc-txt") as ExportFormat;

  const seen = new Set<string>();
  const entries: WordbookEntry[] = [];

  Zotero.debug(
    `[Wordbook] filtering ${highlights.length} highlights by target color ${targetColor}`,
  );

  for (const highlight of highlights) {
    const highlightColor = normalizeColor(highlight.color);
    Zotero.debug(
      `[Wordbook] annotation: "${highlight.text.slice(0, 30)}" color=${highlightColor}`,
    );
    if (highlightColor !== targetColor) {
      continue;
    }

    const word = normalizeWord(highlight.text);
    if (!word) {
      continue;
    }

    const key = word.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    entries.push({
      word,
      sentence: highlight.sentence,
      translation: highlight.translation,
      source: highlight.sourceTitle,
    });
  }

  Zotero.debug(
    `[Wordbook] target color ${targetColor}: ${entries.length} words for ${format} export`,
  );

  if (!entries.length) {
    return 0;
  }

  const path = await new ztoolkit.FilePicker(
    getString("dialog-title"),
    "save",
    getFilePickerFilters(format),
    createDefaultFilename(format),
    win,
  ).open();

  if (!path) {
    return false;
  }

  let content: string;
  if (format === "bbdc-txt") {
    content = createBbdcTxt(entries.map((e) => e.word));
  } else {
    content = createCsv(entries);
  }

  await Zotero.File.putContentsAsync(path, content, "utf-8");
  Zotero.debug(`[Wordbook] exported ${format} to ${path}`);
  return entries.length;
}

export async function exportSelectedWordbook(
  win: _ZoteroTypes.MainWindow,
): Promise<number | false> {
  const itemsWithAttachments = await getSelectedItemsWithAttachments(win);
  if (!itemsWithAttachments.length) {
    return 0;
  }

  const selectedItems = await showExportConfirmDialog(
    win,
    itemsWithAttachments,
  );
  if (selectedItems === false) {
    return false;
  }
  if (!selectedItems.length) {
    return 0;
  }

  const highlights: HighlightAnnotationDebugInfo[] = [];
  for (const { attachments } of selectedItems) {
    for (const attachment of attachments) {
      highlights.push(...(await collectAttachmentHighlights(attachment)));
    }
  }

  return performExport(win, highlights);
}

export async function exportCurrentWordbook(
  win: _ZoteroTypes.MainWindow,
): Promise<number | false> {
  const highlights = await collectCurrentHighlightAnnotations(win);
  return performExport(win, highlights);
}
