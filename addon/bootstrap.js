var ZoteroAnnotationMarkdownInstance;

function startup(data) {
  Services.scriptloader.loadSubScript(`${data.rootURI}plugin.js`, globalThis);
  ZoteroAnnotationMarkdownInstance = ZoteroAnnotationMarkdown.createPlugin({
    Zotero,
    window
  });
  ZoteroAnnotationMarkdownInstance.startup();
}

function shutdown() {
  ZoteroAnnotationMarkdownInstance?.shutdown();
  ZoteroAnnotationMarkdownInstance = undefined;
}

function install() {}

function uninstall() {}
