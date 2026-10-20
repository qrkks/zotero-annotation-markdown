import { createSettings, type Settings } from "../../src/settings.ts";
import type { AnnotationSidebarAdapter } from "../../src/annotation-sidebar-adapter.ts";

/** Match the controller's fallbacks for the older partial settings fixtures. */
export function createSettingsStub(overrides: Partial<Settings>): Settings {
  const settings = createSettings();
  settings.setFastEditorEnabled(false);
  settings.setPlainTextPasteEnabled(false);
  settings.setRenderStrategy("lazy");
  const stub: Settings = {
    ...settings,
    isPopupEnabled: () => stub.isEnabled(),
    ...overrides
  };
  return stub;
}

/** Complete the adapter contract with inert behavior outside each test's scope. */
export function createAdapterStub(overrides: Partial<AnnotationSidebarAdapter>): AnnotationSidebarAdapter {
  return {
    findCommentNodes: () => [],
    findRenderedCommentNodes: () => [],
    countNativeNoteEditorComments: () => 0,
    isEditable: () => false,
    isPopupComment: () => false,
    getSourceText: () => "",
    applyRenderedHtml() {},
    syncImageBadge() {},
    releaseRenderedHtml: () => false,
    suspendRenderedDom: () => null,
    restoreSuspendedRenderedDom: () => false,
    restoreSourceText() {},
    restoreSourceDomForEditing: node => overrides.restoreSourceText?.(node),
    clearRenderedState() {},
    showSourceForEditing: () => false,
    tryShowFastEditorForTarget: () => false,
    tryShowFastEditorForAnnotationID: () => false,
    tryShowFastEditorForEmptyPopupAnnotationID: () => false,
    getAnnotationIDForTarget: () => null,
    getCommentNodesForAnnotationID: () => [],
    getCommentNodeForAnnotationID: () => null,
    setCommittedSource() {},
    closeActiveFastEditor: () => true,
    hasActiveFastEditor: () => false,
    getSelectedAnnotationScrollbar: () => null,
    getPreviewMathScrollbar: () => null,
    preserveActiveFastEditorForScrollbar: () => false,
    commitComment: () => false,
    suppressRendering() {},
    isSuppressed: () => false,
    isRendered: () => false,
    hasPreview: () => false,
    finishEditing() {},
    getCommentNodeForTarget: () => null,
    isCommentEditorTarget: () => false,
    isFastEditorTarget: () => false,
    isOutlineTarget: () => false,
    openLink: null,
    ...overrides
  };
}

// These fixtures deliberately model a host API missing at runtime, outside the
// DOM declarations. Keep the invalid-input cast at this one explicit boundary.
export const missingMutationObserver = null as unknown as typeof MutationObserver;
export const missingIntersectionObserver = null as unknown as typeof IntersectionObserver;
export const missingResizeObserver = null as unknown as typeof ResizeObserver;
