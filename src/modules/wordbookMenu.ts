import { exportCurrentWordbook, exportSelectedWordbook } from "./exporter";
import { getString } from "../utils/locale";

const MENU_CONTAINER_ID = "zotero-wordbook-menu";
const MENU_POPUP_ID = "zotero-wordbook-menupopup";
const MENU_ITEM_CURRENT_ID = "zotero-wordbook-export-current";
const MENU_ITEM_SELECTED_ID = "zotero-wordbook-export-selected";

function showAlertDialog(
  win: _ZoteroTypes.MainWindow,
  message: string,
  title: string,
): void {
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

  const dialog = new ztoolkit.Dialog(2, 1);
  dialog.addCell(0, 0, {
    tag: "p",
    namespace: "html",
    properties: {
      innerHTML: message,
      style: "margin: 24px 32px; font-size: 14px; min-width: 280px;",
    },
  });

  dialog.addButton("OK", "ok").setDialogData(dialogData).open(title);

  // Fire and forget; no need to await
  dialogData.unloadLock.promise.catch(() => {});
}

function getToolsMenuPopup(doc: Document): Element | null {
  return (
    doc.getElementById("menu_ToolsPopup") ??
    doc.getElementById("menu-tools-popup") ??
    doc.querySelector("menupopup#menu_ToolsPopup")
  );
}

export function registerWordbookMenu(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;
  if (doc.getElementById(MENU_CONTAINER_ID)) {
    return;
  }

  const toolsMenu = getToolsMenuPopup(doc);
  if (!toolsMenu) {
    ztoolkit.log("Wordbook: Tools menu popup was not found.");
    return;
  }

  const menu = doc.createXULElement("menu");
  menu.id = MENU_CONTAINER_ID;
  menu.setAttribute("label", getString("menuitem-label"));

  const menupopup = doc.createXULElement("menupopup");
  menupopup.id = MENU_POPUP_ID;

  const itemCurrent = doc.createXULElement("menuitem");
  itemCurrent.id = MENU_ITEM_CURRENT_ID;
  itemCurrent.setAttribute("label", getString("menuitem-current-label"));
  itemCurrent.addEventListener("command", async () => {
    try {
      const exportedCount = await exportCurrentWordbook(win);
      const title = getString("dialog-title");
      if (exportedCount === false) {
        showAlertDialog(win, getString("alert-export-canceled"), title);
      } else if (exportedCount === 0) {
        showAlertDialog(win, getString("alert-export-none"), title);
      } else {
        showAlertDialog(
          win,
          getString("alert-export-success", {
            args: { count: String(exportedCount) },
          }),
          title,
        );
      }
    } catch (error) {
      Zotero.logError(error as Error);
      showAlertDialog(
        win,
        getString("alert-export-error"),
        getString("dialog-title"),
      );
    }
  });

  const itemSelected = doc.createXULElement("menuitem");
  itemSelected.id = MENU_ITEM_SELECTED_ID;
  itemSelected.setAttribute("label", getString("menuitem-selected-label"));
  itemSelected.addEventListener("command", async () => {
    try {
      const exportedCount = await exportSelectedWordbook(win);
      const title = getString("dialog-title");
      if (exportedCount === false) {
        showAlertDialog(win, getString("alert-export-canceled"), title);
      } else if (exportedCount === 0) {
        showAlertDialog(win, getString("alert-export-none"), title);
      } else {
        showAlertDialog(
          win,
          getString("alert-export-success", {
            args: { count: String(exportedCount) },
          }),
          title,
        );
      }
    } catch (error) {
      Zotero.logError(error as Error);
      showAlertDialog(
        win,
        getString("alert-export-error"),
        getString("dialog-title"),
      );
    }
  });

  menupopup.appendChild(itemCurrent);
  menupopup.appendChild(itemSelected);
  menu.appendChild(menupopup);
  toolsMenu.appendChild(menu);

  // Dynamic disable based on current context
  menupopup.addEventListener("popupshowing", () => {
    const selectedType = win.Zotero_Tabs?.selectedType;
    const selectedItems = win.ZoteroPane?.getSelectedItems();
    const hasSelectedItems = selectedItems ? selectedItems.length > 0 : false;

    // In reader: only current document export is available
    if (selectedType === "reader") {
      itemCurrent.setAttribute("disabled", "false");
      itemSelected.setAttribute("disabled", "true");
    }
    // In library with selected items: only selected items export
    else if (selectedType === "library" && hasSelectedItems) {
      itemCurrent.setAttribute("disabled", "true");
      itemSelected.setAttribute("disabled", "false");
    }
    // Other contexts (e.g., note editor): both disabled
    else {
      itemCurrent.setAttribute("disabled", "true");
      itemSelected.setAttribute("disabled", "true");
    }
  });

  ztoolkit.log("Wordbook: Export menu registered.");
}

export function unregisterWordbookMenu(win: Window): void {
  win.document.getElementById(MENU_CONTAINER_ID)?.remove();
}
