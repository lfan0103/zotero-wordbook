// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on zotero-plugin-template by windingwind (AGPL-3.0)

import { getString } from "../utils/locale";

export function registerWordbookPreferences(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}
