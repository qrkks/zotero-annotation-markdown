var ZoteroAnnotationMarkdownInstance;
var ZoteroAnnotationMarkdownPreferencePaneID;

function startup(data) {
  globalThis.ZoteroAnnotationMarkdownDiagnostics = createDiagnostics();
  globalThis.ZoteroAnnotationMarkdownDiagnostics.append("[annotation-markdown] bootstrap startup");

  try {
    Services.scriptloader.loadSubScript(`${data.rootURI}plugin.js`, globalThis);
    ZoteroAnnotationMarkdownInstance = ZoteroAnnotationMarkdown.createPlugin({
      Zotero,
      window: globalThis.window,
      styleText: readStyleTextFromURI(`${data.rootURI}styles/annotation-markdown.css`, data.rootURI),
      diagnostics: globalThis.ZoteroAnnotationMarkdownDiagnostics
    });
    ZoteroAnnotationMarkdownInstance.startup();
    registerPreferencePane(data);
  } catch (error) {
    globalThis.ZoteroAnnotationMarkdownDiagnostics.append(
      `[annotation-markdown] startup failed: ${error?.message || error}\n${error?.stack || ""}`
    );
    throw error;
  }
}

function shutdown() {
  globalThis.ZoteroAnnotationMarkdownDiagnostics?.append("[annotation-markdown] bootstrap shutdown");
  unregisterPreferencePane();
  ZoteroAnnotationMarkdownInstance?.shutdown();
  ZoteroAnnotationMarkdownInstance = undefined;
}

function install() {}

function uninstall() {}

function registerPreferencePane(data) {
  if (!Zotero?.PreferencePanes?.register) {
    return;
  }

  ZoteroAnnotationMarkdownPreferencePaneID = Zotero.PreferencePanes.register({
    pluginID: data.id,
    src: `${data.rootURI}preferences.xhtml`,
    image: `${data.rootURI}icons/annotation-markdown.svg`,
    scripts: [`${data.rootURI}preferences.js`],
    stylesheets: [`${data.rootURI}preferences.css`]
  });
}

function unregisterPreferencePane() {
  if (!ZoteroAnnotationMarkdownPreferencePaneID || !Zotero?.PreferencePanes?.unregister) {
    return;
  }

  Zotero.PreferencePanes.unregister(ZoteroAnnotationMarkdownPreferencePaneID);
  ZoteroAnnotationMarkdownPreferencePaneID = undefined;
}

function readTextFromURI(uri) {
  const request = new XMLHttpRequest();
  request.open("GET", uri, false);
  request.overrideMimeType?.("text/plain");
  request.send(null);

  if (request.status && request.status >= 400) {
    throw new Error(`Could not load ${uri}: ${request.status}`);
  }

  return request.responseText;
}

function readStyleTextFromURI(uri, rootURI) {
  return rewriteRelativeFontUrls(readTextFromURI(uri), rootURI);
}

function rewriteRelativeFontUrls(css, rootURI) {
  return String(css).replaceAll("url(fonts/", `url(${rootURI}styles/fonts/`);
}

function createDiagnostics() {
  return {
    append(message) {
      try {
        const file = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
        file.append("annotation-markdown-debug.log");

        const stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
          .createInstance(Components.interfaces.nsIFileOutputStream);
        stream.init(file, 0x02 | 0x08 | 0x10, 0o644, 0);

        const line = `${new Date().toISOString()} ${message}\n`;
        stream.write(line, line.length);
        stream.close();
      } catch (error) {
        Zotero?.debug?.(`[annotation-markdown] diagnostic write failed: ${error?.message || error}`);
      }
    }
  };
}
