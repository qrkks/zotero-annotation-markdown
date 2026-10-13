// Run only through the development bridge after installing the local test XPI.
async function runSvgDegradationIntegrationNativeQa({ root, expectedProfile, annotationID, fixture = "jordan" } = {}) {
  if (!root || !expectedProfile || !Number.isInteger(annotationID)) throw new Error("Explicit repository, development profile and fixture annotation ID are required.");
  if (Zotero.Profile.dir !== expectedProfile) throw new Error("Wrong development profile.");
  if (!["jordan", "efa-class-styles", "efa-font-shorthand"].includes(fixture)) throw new Error("Unknown QA fixture.");
  const reader = Zotero.Reader._readers.find(candidate => candidate._iframeWindow && !candidate._iframeWindow.document.hidden), rw = reader?._iframeWindow;
  if (!rw || rw.location.href !== "resource://zotero/reader/reader.html") throw new Error("An actual Reader is required.");
  const item = Zotero.Items.get(annotationID);
  if (!item || item.parentID !== reader.itemID) throw new Error("The fixture must belong to the open Reader.");
  const original = item.annotationComment;
  const prefValues = { enabled:true, svgEnabled:true, popupEnabled:false, fastEditor:true, renderStrategy:"eager" };
  const previousPrefs = Object.fromEntries(Object.keys(prefValues).map(key => [key, Zotero.Prefs.get("extensions.annotationMarkdown." + key, true)]));
  const base = root.replaceAll(String.fromCharCode(92), "/").replace(/\/+$/, "") + "/";
  const native = path => path.replaceAll("/", String.fromCharCode(92));
  const source = (await IOUtils.readUTF8(native(base + "tests/fixtures/" + fixture + ".svg"))).replaceAll("\r\n", "\n");
  const hinted = source.replace(/<svg(?=[\s>])/, '<svg shape-rendering="crispEdges"').replace("</svg>", '<style>.qa_hint{cursor:default;text-rendering:optimizeLegibility}</style></svg>');
  const qaToken = Date.now();
  const comment = svg => "# SVG graded degradation QA " + qaToken + "\n\n```svg\n" + svg + "\n```";
  const degraded = comment(hinted), complete = comment(source);
  const unsafe = comment(hinted.replace("</svg>", '<style>.unused{cursor:default;fill:url(https://example.com/blocked.svg)}</style></svg>'));
  const doc = rw.document;
  if (doc.querySelector("textarea")) throw new Error("Close existing editors before running this assessment.");
  const parkFocus = () => doc.querySelector("button.sidebar-toggle").focus({preventScroll:true});
  const row = () => doc.querySelector('[data-sidebar-annotation-id="' + item.key + '"]');
  const preview = () => row()?.querySelector(".annotation-markdown-rendered");
  const assert = (condition, label) => { if (!condition) throw new Error(label); };
  const waitFor = async (check, label) => {
    const until = Date.now() + 8000;
    do { const value = check(); if (value) return value; await new Promise(resolve => rw.setTimeout(resolve, 100)); } while (Date.now() < until);
    const dialog = doc.querySelector('[data-annotation-markdown-svg-viewer]'), viewer = dialog?.querySelector('iframe')?.contentDocument;
    throw new Error("Timed out: " + label + " " + JSON.stringify({rowClass:row()?.className,source:row()?.querySelector('.comment')?.getAttribute('data-annotation-markdown-source')?.slice(0,100),preview:preview()?.innerHTML.slice(0,160),images:preview()?.querySelectorAll('img').length,editing:!!row()?.querySelector('textarea'),svgEnabled:Zotero.Prefs.get('extensions.annotationMarkdown.svgEnabled',true),viewer:dialog?{opacity:dialog.style.opacity,ready:viewer?.readyState,warning:!!viewer?.querySelector('.annotation-markdown-svg-warning'),imageComplete:viewer?.querySelector('img')?.complete,width:viewer?.querySelector('img')?.naturalWidth}:null}));
  };
  const evidence = {date:"2026-10-13",engine:"Zotero " + Zotero.version + " / Gecko",readerURL:rw.location.href,fixture,checks:[]};
  const select = () => reader._internalReader.setSelectedAnnotations(Components.utils.cloneInto([item.key], rw), false);
  const record = (name, details = {}) => evidence.checks.push({name,passed:true,...details});
  const save = async text => {
    // Use the same Reader persistence boundary as a user's annotation edit.
    reader._annotationManager.updateAnnotations(Components.utils.cloneInto([{id:item.key,comment:text ?? ""}], rw));
    await waitFor(() => (item.annotationComment ?? "") === (text ?? "") && reader._annotationManager._unsavedAnnotations.size === 0, "stored annotation comment");
  };
  const edit = async text => {
    select();
    await waitFor(() => row()?.classList.contains("selected"), "selected annotation");
    const target = preview().querySelector(".annotation-markdown-svg-warning:not([hidden]), h1") ?? preview();
    target.scrollIntoView({block:"center"});
    const bounds = target.getBoundingClientRect();
    const mouse = {bubbles:true,button:0,cancelable:true,clientX:bounds.left + bounds.width / 2,clientY:bounds.top + bounds.height / 2};
    target.dispatchEvent(new rw.PointerEvent("pointerdown", mouse));
    target.dispatchEvent(new rw.MouseEvent("mousedown", mouse));
    const editor = await waitFor(() => row().querySelector("textarea"), "source editor");
    editor.value = text;
    editor.dispatchEvent(new rw.Event("input", {bubbles:true}));
    editor.dispatchEvent(new rw.KeyboardEvent("keydown", {key:"Escape",bubbles:true,cancelable:true}));
    await waitFor(() => !row().querySelector("textarea") && item.annotationComment === text, "saved editor draft");
    parkFocus();
  };
  try {
    parkFocus();
    // Prepare the saved fixture while native source is visible, so setup does
    // not bypass the plugin's normal edit/cache reconciliation contract.
    Zotero.Prefs.set("extensions.annotationMarkdown.enabled", false, true);
    Zotero.Prefs.set("extensions.annotationMarkdown.popupEnabled", false, true);
    await waitFor(() => !row()?.querySelector(".annotation-markdown-rendered"), "fixture setup cleanup");
    await save(degraded);
    for (const [key,value] of Object.entries(prefValues)) Zotero.Prefs.set("extensions.annotationMarkdown." + key, value, true);
    select();
    const image = await waitFor(() => row()?.classList.contains("selected") && row().querySelector('.comment')?.getAttribute('data-annotation-markdown-source')?.startsWith("# SVG graded degradation QA " + qaToken) && preview()?.querySelector(".annotation-markdown-svg-image"), "saved degraded preview");
    const warning = preview().querySelector(".annotation-markdown-svg-warning");
    assert(warning?.textContent.includes("3 display hints"), "Saved preview needs the omission warning.");
    if (item.annotationComment !== degraded) {
      const actual = item.annotationComment ?? "";
      let offset = 0; while (offset < Math.min(actual.length, degraded.length) && actual[offset] === degraded[offset]) offset++;
      throw new Error("Stored source changed during rendering: " + JSON.stringify({offset,actual:actual.slice(offset,offset+80),expected:degraded.slice(offset,offset+80),lengths:[actual.length,degraded.length]}));
    }
    assert(!preview().querySelector("svg, style, script"), "User markup entered the live preview.");
    await image.decode();
    record("saved-degraded-preview", {originalSourcePreserved:true,warningCount:preview().querySelectorAll(".annotation-markdown-svg-warning").length});

    const reference = doc.createElement("img"); reference.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source); await reference.decode();
    const pixels = img => { const canvas = doc.createElement("canvas"); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight; const context=canvas.getContext("2d"); context.drawImage(img,0,0); return context.getImageData(0,0,canvas.width,canvas.height).data; };
    const actual = pixels(image), expected = pixels(reference); let changedPixels=0;
    for (let index=0; index<actual.length; index+=4) if ([0,1,2,3].some(channel => actual[index+channel] !== expected[index+channel])) changedPixels++;
    assert(changedPixels === 0, "Degraded EFA differs from the supported reference.");
    record("native-pixel-comparison", {width:image.naturalWidth,height:image.naturalHeight,changedPixels});

    preview().querySelector(".annotation-markdown-svg-image").click();
    const dialog = await waitFor(() => doc.querySelector("[data-annotation-markdown-svg-viewer]"), "large viewer");
    const frame = dialog.querySelector("iframe");
    await waitFor(() => dialog.style.opacity === "" && frame.contentDocument.querySelector(".annotation-markdown-svg-warning"), "decoded viewer and warning");
    assert(frame.contentDocument.querySelector(".annotation-markdown-svg-warning").textContent === warning.textContent, "Viewer warning changed.");
    const controls = frame.contentDocument;
    controls.querySelector("[aria-label='Close SVG diagram']").dispatchEvent(new controls.defaultView.KeyboardEvent("keydown", {key:"Escape",bubbles:true,cancelable:true}));
    assert(!doc.querySelector("[data-annotation-markdown-svg-viewer]"), "Viewer did not close.");
    assert(doc.activeElement === preview().querySelector(".annotation-markdown-svg-open"), "Opener focus was not restored.");
    record("viewer-warning-escape-focus");

    parkFocus();
    Zotero.Prefs.set("extensions.annotationMarkdown.svgEnabled", false, true);
    await waitFor(() => preview()?.querySelector("code") && !preview().querySelector(".annotation-markdown-svg-image, .annotation-markdown-svg-warning"), "SVG disabled");
    Zotero.Prefs.set("extensions.annotationMarkdown.svgEnabled", true, true);
    await waitFor(() => preview()?.querySelector(".annotation-markdown-svg-warning"), "SVG re-enabled");
    assert(preview().querySelectorAll(".annotation-markdown-svg-warning").length === 1, "Warning duplicated after refresh.");
    record("preference-cache-refresh");

    preview().querySelector(".annotation-markdown-svg-image").dispatchEvent(new rw.Event("error"));
    assert(preview().querySelector(".annotation-markdown-svg-warning").hidden && !preview().querySelector(".annotation-markdown-svg-fallback").hidden, "Image failure did not replace the warning with source fallback.");
    assert(preview().querySelector(".annotation-markdown-svg-fallback code").textContent.trimEnd() === hinted.trimEnd(), "Image fallback changed source.");
    record("image-load-source-fallback");
    parkFocus();
    Zotero.Prefs.set("extensions.annotationMarkdown.svgEnabled", false, true);
    await waitFor(() => preview()?.querySelector("code") && !preview().querySelector(".annotation-markdown-svg-image"), "disabled after image failure");
    Zotero.Prefs.set("extensions.annotationMarkdown.svgEnabled", true, true);
    await waitFor(() => preview()?.querySelector(".annotation-markdown-svg-warning:not([hidden])"), "fresh preview after image failure");

    await edit(complete);
    await waitFor(() => preview()?.querySelector(".annotation-markdown-svg-image") && !preview().querySelector(".annotation-markdown-svg-warning"), "complete preview after save");
    record("saved-edit-clears-warning", {storedSourceMatches:true});
    await edit(unsafe);
    await waitFor(() => preview()?.querySelector(".annotation-markdown-svg-error") && !preview().querySelector(".annotation-markdown-svg-image, .annotation-markdown-svg-warning"), "unsafe input source fallback");
    assert(preview().querySelector("code").textContent.trimEnd() === unsafe.match(/```svg\n([\s\S]*)\n```$/)[1].trimEnd(), "Blocked source changed.");
    record("saved-unsafe-edit-falls-back", {noImage:true,storedSourceMatches:true});
    Zotero.Prefs.set("extensions.annotationMarkdown.enabled", false, true);
    await waitFor(() => !row()?.querySelector(".annotation-markdown-rendered, .annotation-markdown-svg-warning"), "disabled rendering cleanup");
    record("disabled-rendering-cleanup");
    Zotero.Prefs.set("extensions.annotationMarkdown.enabled", true, true);
    await waitFor(() => preview()?.querySelector(".annotation-markdown-svg-error"), "re-enabled rendering");
    record("re-enabled-rendering");
  } catch (error) {
    evidence.failure = String(error);
    throw error;
  } finally {
    const editor = row()?.querySelector("textarea");
    if (editor) {
      editor.value = original ?? "";
      editor.dispatchEvent(new rw.KeyboardEvent("keydown", {key:"Escape",bubbles:true,cancelable:true}));
      await new Promise(resolve => rw.setTimeout(resolve, 1500));
    }
    parkFocus();
    Zotero.Prefs.set("extensions.annotationMarkdown.enabled", false, true);
    Zotero.Prefs.set("extensions.annotationMarkdown.popupEnabled", false, true);
    try {
      await waitFor(() => !row()?.querySelector(".annotation-markdown-rendered"), "restoration cleanup");
    } finally {
      try { await save(original); }
      finally {
        for (const [key,value] of Object.entries(previousPrefs)) Zotero.Prefs.set("extensions.annotationMarkdown." + key, value, true);
        evidence.restored = item.annotationComment === original;
        await IOUtils.writeUTF8(native(base + "output/svg-degradation-integration/native-lifecycle.json"), JSON.stringify(evidence,null,2));
      }
    }
  }
  return JSON.stringify(evidence);
}
