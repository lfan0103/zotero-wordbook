export interface HighlightAnnotationDebugInfo {
  id: number;
  key: string;
  type: _ZoteroTypes.Annotations.AnnotationType;
  color: string;
  text: string;
  sentence: string;
  pageLabel: string;
  attachmentID: number;
  attachmentKey: string;
  sourceTitle: string;
  translation: string;
}

function getSelectedItems(win: _ZoteroTypes.MainWindow): Zotero.Item[] {
  return win.ZoteroPane.getSelectedItems();
}

function getAttachmentItems(item: Zotero.Item): Zotero.Item[] {
  if (item.isAttachment()) {
    return [item];
  }

  if (!item.isRegularItem()) {
    return [];
  }

  const attachmentIDs = item.getAttachments(false);
  return Zotero.Items.get(attachmentIDs).filter((attachment) =>
    attachment.isAttachment(),
  );
}

async function getAttachmentFullText(
  attachment: Zotero.Item,
): Promise<string | null> {
  if (!attachment.isPDFAttachment()) {
    return null;
  }

  try {
    const result = (await Zotero.PDFWorker.getFullText(
      attachment.id,
    )) as {
      text: string;
      extractedPages: number;
      totalPages: number;
    };
    return result.text || null;
  } catch (e) {
    Zotero.debug(
      `[Wordbook] failed to get full text for attachment ${attachment.id}: ${e}`,
    );
    return null;
  }
}

function normalizeText(text: string): string {
  // Preserve paragraph breaks (double newline) and line breaks,
  // only collapse horizontal whitespace (spaces, tabs)
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/[ \t]*\n/g, "\n")
    .replace(/\n\n+/g, "\n\n")
    .trim();
}

function extractSentence(fullText: string, highlight: string): string {
  const normHighlight = highlight.replace(/[ \t]+/g, " ").trim();
  const normText = normalizeText(fullText);

  const idx = normText.indexOf(normHighlight);
  if (idx === -1) {
    return "";
  }

  // Step 1: Find paragraph boundaries (double newline or single newline)
  let paraStart = 0;
  let paraEnd = normText.length;

  const doubleBreakBefore = normText.lastIndexOf("\n\n", idx);
  if (doubleBreakBefore !== -1) {
    paraStart = doubleBreakBefore + 2;
  } else {
    const singleBreakBefore = normText.lastIndexOf("\n", idx);
    if (singleBreakBefore !== -1) {
      paraStart = singleBreakBefore + 1;
    }
  }

  const doubleBreakAfter = normText.indexOf("\n\n", idx + normHighlight.length);
  if (doubleBreakAfter !== -1) {
    paraEnd = doubleBreakAfter;
  } else {
    const singleBreakAfter = normText.indexOf("\n", idx + normHighlight.length);
    if (singleBreakAfter !== -1) {
      paraEnd = singleBreakAfter;
    }
  }

  const paragraph = normText.slice(paraStart, paraEnd);
  const localIdx = idx - paraStart;

  // Step 2: Within paragraph, find sentence boundaries
  let sentStart = 0;
  for (let i = localIdx - 1; i >= 0; i--) {
    if (
      /[.!?]/.test(paragraph[i]) &&
      (i + 1 >= paragraph.length || paragraph[i + 1] === " " || paragraph[i + 1] === "\n")
    ) {
      sentStart = i + 2;
      break;
    }

    // Treat newline followed by capital letter as sentence boundary
    // (handles titles like "Abstract\nWhile..." in academic papers)
    if (
      paragraph[i] === "\n" &&
      i + 1 < paragraph.length &&
      /[A-Z]/.test(paragraph[i + 1])
    ) {
      sentStart = i + 1;
      break;
    }
  }

  let sentEnd = paragraph.length;
  for (
    let i = localIdx + normHighlight.length;
    i < paragraph.length;
    i++
  ) {
    if (
      /[.!?]/.test(paragraph[i]) &&
      (i + 1 === paragraph.length || paragraph[i + 1] === " " || paragraph[i + 1] === "\n")
    ) {
      sentEnd = i + 1;
      break;
    }

    // Treat newline followed by capital letter as sentence boundary
    if (
      paragraph[i] === "\n" &&
      i + 1 < paragraph.length &&
      /[A-Z]/.test(paragraph[i + 1])
    ) {
      sentEnd = i;
      break;
    }
  }

  return paragraph.slice(sentStart, sentEnd).trim();
}

function getSourceTitle(attachment: Zotero.Item): string {
  const parent = attachment.parentItem;
  if (parent) {
    return (parent.getField("title") as string) || "";
  }
  return (attachment.getField("title") as string) || "";
}

function getTranslation(annotation: Zotero.Item): string {
  const comment = annotation.annotationComment || "";
  if (comment.trim()) {
    return comment.trim();
  }
  return "";
}

async function toDebugInfo(
  annotation: Zotero.Item,
  attachment: Zotero.Item,
  fullText: string | null,
): Promise<HighlightAnnotationDebugInfo> {
  const text = annotation.annotationText || "";
  const sentence = fullText ? extractSentence(fullText, text) : "";

  return {
    id: annotation.id,
    key: annotation.key,
    type: annotation.annotationType,
    color: annotation.annotationColor,
    text,
    sentence,
    pageLabel: annotation.annotationPageLabel,
    attachmentID: attachment.id,
    attachmentKey: attachment.key,
    sourceTitle: getSourceTitle(attachment),
    translation: getTranslation(annotation),
  };
}

export async function collectAttachmentHighlights(
  attachment: Zotero.Item,
): Promise<HighlightAnnotationDebugInfo[]> {
  const annotations = attachment.getAnnotations(false);
  const fullText = await getAttachmentFullText(attachment);

  const highlights = await Promise.all(
    annotations
      .filter((annotation) => annotation.annotationType === "highlight")
      .map((annotation) => toDebugInfo(annotation, attachment, fullText)),
  );

  Zotero.debug(
    `[Wordbook] attachment ${attachment.id}/${attachment.key}: ${highlights.length} highlight annotations`,
  );

  return highlights;
}

export interface ItemWithAttachments {
  item: Zotero.Item;
  attachments: Zotero.Item[];
}

export async function getSelectedItemsWithAttachments(
  win: _ZoteroTypes.MainWindow,
): Promise<ItemWithAttachments[]> {
  const selectedItems = getSelectedItems(win);
  Zotero.debug(`[Wordbook] selected items: ${selectedItems.length}`);

  const result = selectedItems
    .map((item) => ({
      item,
      attachments: getAttachmentItems(item),
    }))
    .filter(({ attachments }) => attachments.length > 0);

  Zotero.debug(`[Wordbook] items with attachments: ${result.length}`);
  return result;
}

export async function collectCurrentHighlightAnnotations(
  win: _ZoteroTypes.MainWindow,
): Promise<HighlightAnnotationDebugInfo[]> {
  const selectedType = win.Zotero_Tabs?.selectedType;
  if (selectedType !== "reader") {
    Zotero.debug("[Wordbook] no reader tab is currently active");
    return [];
  }

  const selectedID = win.Zotero_Tabs?.selectedID;
  const reader = Zotero.Reader.getByTabID(selectedID);
  if (!reader || !reader._item) {
    Zotero.debug("[Wordbook] failed to get current reader item");
    return [];
  }

  const attachment = reader._item;
  if (!attachment.isPDFAttachment()) {
    Zotero.debug(
      `[Wordbook] current item ${attachment.id} is not a PDF attachment`,
    );
    return [];
  }

  Zotero.debug(
    `[Wordbook] current reader attachment: ${attachment.id}/${attachment.key}`,
  );
  return collectAttachmentHighlights(attachment);
}

export async function collectSelectedHighlightAnnotations(
  win: _ZoteroTypes.MainWindow,
): Promise<HighlightAnnotationDebugInfo[]> {
  const itemsWithAttachments = await getSelectedItemsWithAttachments(win);
  const highlights: HighlightAnnotationDebugInfo[] = [];
  for (const { attachments } of itemsWithAttachments) {
    for (const attachment of attachments) {
      highlights.push(...(await collectAttachmentHighlights(attachment)));
    }
  }
  return highlights;
}

export async function logSelectedHighlightAnnotations(
  win: _ZoteroTypes.MainWindow,
): Promise<number> {
  const highlights = await collectSelectedHighlightAnnotations(win);
  for (const highlight of highlights) {
    Zotero.debug(`[Wordbook] highlight ${JSON.stringify(highlight)}`);
  }

  Zotero.debug(`[Wordbook] total highlight annotations: ${highlights.length}`);
  return highlights.length;
}
