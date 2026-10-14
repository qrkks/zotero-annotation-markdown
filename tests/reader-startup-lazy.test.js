import vm from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { createReaderStartupLazyManager, READER_STARTUP_LAZY_PAGE_SOURCE } from "../src/reader-startup-lazy.ts";

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

function managerFixture() {
  let enabled = true;
  const stop = vi.fn();
  const page = { eval: vi.fn(() => ({ stop, status: () => ({ active: true }) })) };
  const readers = [];
  const manager = createReaderStartupLazyManager({ readerApi: { _readers: readers }, isEnabled: () => enabled });
  const reader = { _iframeWindow: page, _waitForReader: vi.fn(async () => "native-result") };
  return { manager, readers, reader, page, stop, disable: () => { enabled = false; } };
}

test("installs between native page readiness and Reader creation and restores the inherited wait method", async () => {
  const f = managerFixture();
  const originalPush = f.readers.push;
  const originalWait = f.reader._waitForReader;
  f.manager.refresh();
  expect(f.readers.push(f.reader)).toBe(1);
  expect(f.page.eval).not.toHaveBeenCalled();
  expect(await f.reader._waitForReader()).toBe("native-result");
  expect(f.page.eval).toHaveBeenCalledOnce();
  expect(f.reader._waitForReader).toBe(originalWait);
  f.manager.stop();
  expect(f.readers.push).toBe(originalPush);
  expect(Object.hasOwn(f.readers, "push")).toBe(false);
  expect(f.stop).toHaveBeenCalledOnce();
});

test("disabling during native initialization prevents late installation and restores pending methods", async () => {
  const f = managerFixture();
  let ready;
  f.reader._waitForReader = vi.fn(() => new Promise(resolve => { ready = resolve; }));
  const original = f.reader._waitForReader;
  f.manager.refresh();
  f.readers.push(f.reader);
  const pending = f.reader._waitForReader();
  f.disable(); f.manager.refresh(); ready("ready");
  expect(await pending).toBe("ready");
  expect(f.page.eval).not.toHaveBeenCalled();
  expect(f.reader._waitForReader).toBe(original);
});

test("preserves native initialization failures and never patches initialized Readers", async () => {
  const f = managerFixture();
  f.manager.refresh();
  const error = new Error("native failed");
  f.reader._waitForReader = vi.fn(async () => { throw error; });
  const original = f.reader._waitForReader;
  f.readers.push(f.reader);
  await expect(f.reader._waitForReader()).rejects.toBe(error);
  expect(f.reader._waitForReader).toBe(original);
  f.readers.push({ ...f.reader, _internalReader: {} });
  expect(f.page.eval).not.toHaveBeenCalled();
  f.manager.stop();
});

test("cleanup leaves a later plugin's collection hook intact", () => {
  const f = managerFixture(); f.manager.refresh();
  const wrapper = f.readers.push;
  const later = function(...entries) { return wrapper.apply(this, entries); };
  f.readers.push = later; f.manager.stop();
  expect(f.readers.push).toBe(later);
  f.readers.push(f.reader);
  expect(f.page.eval).not.toHaveBeenCalled();
});

test("later frozen hook descriptors cannot reject native readiness or interrupt cleanup", async () => {
  const f=managerFixture(); f.manager.refresh(); f.readers.push(f.reader);
  Object.freeze(f.readers);
  Object.defineProperty(f.reader,"_waitForReader",{configurable:false,writable:false});
  expect(()=>f.manager.stop()).not.toThrow();
  expect(await f.reader._waitForReader()).toBe("native-result");
  expect(f.page.eval).not.toHaveBeenCalled();
});

function pageFixture(count = 120, painted = true, initialize = true, commitDelay = 0) {
  vi.useFakeTimers();
  const timeOrigin = Date.now();
  document.body.innerHTML = '<div id="annotations" class="annotations"><div class="annotation" data-sidebar-annotation-id="a110"><div class="preview"></div></div></div>';
  const root = document.getElementById("annotations");
  const element = root.querySelector(".preview");
  let observer;
  const setters = [];
  const cleanups = new Map();let currentSetter;
  const React = {
    version: "18.3.1", createElement: vi.fn((type, props, ...children) => ({ type, props, children })),
    useState: initial => {const setter=vi.fn(value=>{setters.push(value);setTimeout(()=>cleanups.get(setter)?.(),commitDelay);});currentSetter=setter;return [typeof initial === "function" ? initial() : initial,setter];},
    startTransition:vi.fn(callback=>callback()),
    useRef: () => ({ current: element }), useEffect: effect => effect(), useLayoutEffect: effect => {const cleanup=effect();if(typeof cleanup==="function")cleanups.set(currentSetter,cleanup);}
  };
  function SidebarPreview(props) { const lastImageRef = props.annotation.image; return lastImageRef; }
  const canvas=document.createElement("canvas");canvas.width=100;canvas.height=200;
  const viewerContainer=document.createElement("div");viewerContainer.append(canvas);document.body.append(viewerContainer);
  canvas.getBoundingClientRect=()=>({top:0,bottom:200,left:0,right:100,width:100,height:200});
  viewerContainer.getBoundingClientRect=()=>({top:0,bottom:600,left:0,right:500,width:500,height:600});
  const pdfPage={renderingState:painted?3:0,canvas};
  const pdfViewer={currentPageNumber:1,getPageView:()=>pdfPage};
  let resolveInitialized;
  const initializedPromise=initialize?undefined:new Promise(resolve=>{resolveInitialized=resolve;});
  const reader={_primaryView:{initializedPromise,_iframeWindow:{document:{getElementById:()=>viewerContainer},PDFViewerApplication:{pdfViewer}}}};
  const factory = vi.fn(() => reader);
  const page = { window: null, document, React, ReactDOM: { flushSync: callback => callback(), unstable_batchedUpdates:vi.fn(callback=>callback()) },
    createReader: factory, innerHeight: 600, performance: { now: () => Date.now() - timeOrigin },
    setTimeout, clearTimeout, requestAnimationFrame: callback => setTimeout(callback,16), cancelAnimationFrame: clearTimeout,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    IntersectionObserver: class { constructor(callback) { observer = callback; } observe() {} unobserve() {} disconnect() {} }
  };
  page.window = page;
  const runtime = vm.runInNewContext(READER_STARTUP_LAZY_PAGE_SOURCE,page);
  const annotations = Array.from({length:count},(_,i)=>({id:`a${i}`,comment:"untouched",tags:[]}));
  const options = { type:"pdf", annotations, sidebarOpen:false, sidebarView:"outline", primaryViewState:{pageIndex:5} };
  page.createReader(options);
  if(painted)vi.advanceTimersByTime(100);
  function render(index = 110, selected = false, extra = {}) {
    const props = { annotation:annotations[index], selected, ...extra };
    const created = React.createElement(SidebarPreview,props);
    return created.type === SidebarPreview ? created : created.type(props);
  }
  return { page, React, runtime, options, factory, SidebarPreview, root, element, setters, render, pdfPage, resolveInitialized,
    intersect: visible => observer([{target:element,isIntersecting:visible}]) };
}

test("cold-start interception preserves factory arguments, native outer rows and selected content", () => {
  const f=pageFixture();
  expect(f.factory).toHaveBeenCalledWith(f.options);
  expect(f.options.sidebarOpen).toBe(false);
  expect(f.options.sidebarView).toBe("outline");
  expect(f.render().props["data-annotation-markdown-startup-preview"]).toBe("true");
  expect(f.render(110,true).type).toBe(f.SidebarPreview);
  expect(f.render(0).type).toBe(f.SidebarPreview);
  expect(document.querySelectorAll(".annotation")).toHaveLength(1);
  expect(f.options.annotations[110].comment).toBe("untouched");
  f.runtime.stop(true);
});

test("defers even the first sidebar preview until the current PDF page has painted and yielded display frames", () => {
  const f=pageFixture(120,false);
  expect(f.render(0).props["data-annotation-markdown-startup-preview"]).toBe("true");
  f.intersect(true);vi.advanceTimersByTime(200);
  expect(f.setters).toEqual([]);
  expect(f.runtime.status().bodyReady).toBe(false);
  f.pdfPage.renderingState=3;
  vi.advanceTimersByTime(50);
  expect(f.setters).toEqual([]);
  vi.advanceTimersByTime(100);
  expect(f.runtime.status().bodyReady).toBe(true);
  expect(f.setters).toEqual([true]);
  f.runtime.stop(true);
});

test("a PDF still loading after ten seconds keeps automatic previews deferred until its current page paints", () => {
  const f=pageFixture(120,false);
  f.render(0);f.intersect(true);
  vi.advanceTimersByTime(20100);
  expect(f.runtime.status().bodyReady).toBe(false);
  expect(f.setters).toEqual([]);
  f.pdfPage.renderingState=3;
  vi.advanceTimersByTime(100);
  expect(f.runtime.status().bodyReason).toBe("pdf-painted");
  expect(f.setters).toEqual([true]);
  f.runtime.stop(true);
});

test("an unsupported PDF readiness probe still has bounded progressive fallback", () => {
  const f=pageFixture(120,false);
  delete f.factory.mock.results[0].value._primaryView._iframeWindow.PDFViewerApplication;
  f.render(0);f.intersect(true);
  vi.advanceTimersByTime(10100);
  expect(f.runtime.status().bodyReason).toBe("pdf-timeout-fallback");
  expect(f.setters).toEqual([true]);
  f.runtime.stop(true);
});

test("a failed current PDF page can fall back without waiting forever", () => {
  const f=pageFixture(120,false);
  f.pdfPage.renderingState=3;f.pdfPage._renderError=new Error("render failed");
  f.render(0);f.intersect(true);
  vi.advanceTimersByTime(10100);
  expect(f.runtime.status().bodyReason).toBe("pdf-error-fallback");
  expect(f.setters).toEqual([true]);
  f.runtime.stop(true);
});

test("a rejected PDF loading task releases progressive fallback even when view initialization stays pending", async()=>{
  const f=pageFixture(120,false,false);
  const app=f.factory.mock.results[0].value._primaryView._iframeWindow.PDFViewerApplication;
  let reject;app.pdfLoadingTask={promise:new Promise((_,fail)=>{reject=fail;})};
  f.render(0);f.intersect(true);vi.advanceTimersByTime(50);
  reject(new Error("PDF failed to load"));await vi.advanceTimersByTimeAsync(100);
  expect(f.runtime.status().bodyReason).toBe("pdf-error-fallback");
  expect(f.setters).toEqual([true]);f.runtime.stop(true);
});

test("failure of a replaced PDF loading task cannot release previews for its healthy replacement",async()=>{
  const f=pageFixture(120,false,false);
  const app=f.factory.mock.results[0].value._primaryView._iframeWindow.PDFViewerApplication;
  let reject;app.pdfLoadingTask={promise:new Promise((_,fail)=>{reject=fail;})};
  vi.advanceTimersByTime(50);
  app.pdfLoadingTask={promise:Promise.resolve()};reject(new Error("old task cancelled"));
  await vi.advanceTimersByTimeAsync(100);
  expect(f.runtime.status().bodyReady).toBe(false);f.runtime.stop(true);
});

test("closing during prolonged PDF loading cancels polling and deferred previews", () => {
  const f=pageFixture(120,false);
  f.render(0);f.intersect(true);vi.advanceTimersByTime(11000);
  f.runtime.stop(true);vi.runAllTimers();
  expect(f.setters).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("a restored selected annotation also waits for the body, and closing cancels its pending release", () => {
  const f=pageFixture(120,false);
  expect(f.render(110,true).props["data-annotation-markdown-startup-preview"]).toBe("true");
  f.runtime.stop(true);f.pdfPage.renderingState=3;
  vi.runAllTimers();expect(f.setters).toEqual([]);
});

test("a rendered prefetch page does not release the sidebar before the current restored page", () => {
  const f=pageFixture(120,false),viewer=f.factory.mock.results[0].value._primaryView._iframeWindow.PDFViewerApplication.pdfViewer;
  viewer.currentPageNumber=2;
  viewer.getPageView=index=>index===0?{...f.pdfPage,renderingState:3}:f.pdfPage;
  vi.advanceTimersByTime(200);expect(f.runtime.status().bodyReady).toBe(false);
  f.pdfPage.renderingState=3;vi.advanceTimersByTime(100);
  expect(f.runtime.status().bodyReady).toBe(true);f.runtime.stop(true);
});

test("an offscreen or failed canvas does not count as readable PDF content", () => {
  const f=pageFixture(120,false);
  f.pdfPage.renderingState=3;
  const bounds=f.pdfPage.canvas.getBoundingClientRect;
  f.pdfPage.canvas.getBoundingClientRect=()=>({top:0,bottom:200,left:600,right:700,width:100,height:200});
  vi.advanceTimersByTime(100);expect(f.runtime.status().bodyReady).toBe(false);
  f.pdfPage.canvas.getBoundingClientRect=bounds;f.pdfPage._renderError=new Error("paint failed");
  vi.advanceTimersByTime(100);expect(f.runtime.status().bodyReady).toBe(false);
  f.runtime.stop(true);
});

test("waits for restored PDF view state before accepting a painted page", async()=>{
  const f=pageFixture(120,false,false);f.pdfPage.renderingState=3;
  vi.advanceTimersByTime(100);expect(f.runtime.status().bodyReady).toBe(false);
  f.resolveInitialized();await vi.advanceTimersByTimeAsync(100);
  expect(f.runtime.status().bodyReady).toBe(true);
  f.runtime.stop(true);
});

test("a destroyed PDF event bus cannot interrupt early-close hook restoration", ()=>{
  const f=pageFixture(120,false);
  const app=f.factory.mock.results[0].value._primaryView._iframeWindow.PDFViewerApplication;
  app.eventBus={on:vi.fn(),off:vi.fn(()=>{throw new Error("dead iframe");})};
  vi.advanceTimersByTime(100);
  expect(()=>f.runtime.stop(true)).not.toThrow();
  expect(f.page.createReader).toBe(f.factory);
});

test("small lists and unsupported page APIs retain native creation", () => {
  const f=pageFixture(19);
  expect(f.render(18).type).toBe(f.SidebarPreview);
  f.runtime.stop(true);
  f.page.React.version="19.0.0";
  expect(vm.runInNewContext(READER_STARTUP_LAZY_PAGE_SOURCE,f.page)).toBeUndefined();
});

test("placeholder click and context menu use native annotation callbacks", () => {
  const f=pageFixture();
  const onClickSection=vi.fn(),onOpenContextMenu=vi.fn();
  const shell=f.render(110,false,{onClickSection,onOpenContextMenu});
  const click={ctrlKey:true}; shell.props.onClick(click);
  expect(onClickSection).toHaveBeenCalledWith("a110","header",click);
  const context={button:2,clientX:10,clientY:20,stopPropagation:vi.fn(),preventDefault:vi.fn()};
  shell.props.onContextMenu(context);
  expect(onOpenContextMenu).toHaveBeenCalledWith({ids:["a110"],currentID:"a110",x:10,y:20});
  expect(context.preventDefault).toHaveBeenCalled();
  f.runtime.stop(true);
});

test("dragging a deferred preview delegates native annotation data transfer", () => {
  const f=pageFixture(); const onSetDataTransferAnnotations=vi.fn();
  const shell=f.render(110,false,{onSetDataTransferAnnotations});
  const dataTransfer={setDragImage:vi.fn()};
  f.element.getBoundingClientRect=()=>({left:5,top:10});
  shell.props.onDragStart({currentTarget:f.element,dataTransfer,clientX:15,clientY:30});
  expect(dataTransfer.setDragImage).toHaveBeenCalledWith(f.root.firstElementChild,10,20);
  expect(onSetDataTransferAnnotations).toHaveBeenCalledWith(dataTransfer,f.options.annotations[110]);
  f.runtime.stop(true);
});

test("failed native factory creation restores owned React hooks", () => {
  const f=pageFixture(); f.runtime.stop(true);
  const originalElement=f.React.createElement;
  const fail=vi.fn(()=>{throw new Error("native factory failed");});
  f.page.createReader=fail;
  vm.runInNewContext(READER_STARTUP_LAZY_PAGE_SOURCE,f.page);
  expect(()=>f.page.createReader(f.options)).toThrow("native factory failed");
  expect(f.React.createElement).toBe(originalElement);
  expect(f.page.createReader).toBe(fail);
  expect(f.page.__annotationMarkdownReaderStartupV1).toBeUndefined();
});

test("scrolling cancels departed previews and Reader close cancels queued mounting", () => {
  const f=pageFixture(); f.render();
  f.intersect(true); f.intersect(false);
  vi.runOnlyPendingTimers(); expect(f.setters).toEqual([]);
  f.intersect(true); f.runtime.stop(true);
  vi.runAllTimers(); expect(f.setters).toEqual([]);
  expect(f.page.__annotationMarkdownReaderStartupV1).toBeUndefined();
});

test("live disable restores factories immediately and recovers shells in bounded batches", () => {
  const f=pageFixture();
  const original=f.factory;
  f.render(); f.runtime.stop();
  expect(f.page.createReader).toBe(original);
  expect(f.runtime.status().active).toBe(false);
  expect(f.setters).toEqual([]);
  vi.runAllTimers();
  expect(f.setters).toEqual([true]);
  expect(f.page.__annotationMarkdownReaderStartupV1).toBeUndefined();
});

test("large live-disable recovery bounds each commit and avoids recovery layout measurements",()=>{
  const f=pageFixture(423);
  for(let i=100;i<140;i++)f.render(i);
  f.root.getBoundingClientRect=vi.fn();
  f.root.firstElementChild.getBoundingClientRect=vi.fn();
  f.page.ReactDOM.flushSync=vi.fn(callback=>callback());
  f.runtime.stop();
  expect(f.setters).toHaveLength(0);
  vi.advanceTimersByTime(17);
  expect(f.setters.length).toBeGreaterThan(1);
  expect(f.setters.length).toBeLessThanOrEqual(8);
  expect(f.React.startTransition).not.toHaveBeenCalled();
  expect(f.page.ReactDOM.unstable_batchedUpdates).not.toHaveBeenCalled();
  expect(f.page.ReactDOM.flushSync).toHaveBeenCalledOnce();
  vi.runAllTimers();expect(f.setters).toHaveLength(40);
  expect(f.page.ReactDOM.flushSync.mock.calls.length).toBeLessThan(40);
  expect(f.root.getBoundingClientRect).not.toHaveBeenCalled();
  expect(f.root.firstElementChild.getBoundingClientRect).not.toHaveBeenCalled();
  expect(f.page.__annotationMarkdownReaderStartupV1).toBeUndefined();
});

test("live-disable recovery waits for the preceding previews to commit before scheduling more",()=>{
  const f=pageFixture(423,true,true,200);
  for(let i=100;i<124;i++)f.render(i);
  f.runtime.stop();vi.advanceTimersByTime(200);
  expect(f.setters).toHaveLength(8);
  expect(f.runtime.status().recovering).toBe(true);
  vi.advanceTimersByTime(40);expect(f.setters).toHaveLength(16);
  vi.runAllTimers();expect(f.setters).toHaveLength(24);
  expect(f.page.__annotationMarkdownReaderStartupV1).toBeUndefined();
});

test("closing during a recovery batch cancels the remaining native commits",()=>{
  const f=pageFixture(423);for(let i=100;i<140;i++)f.render(i);
  f.runtime.stop();vi.advanceTimersByTime(17);const mounted=f.setters.length;
  f.runtime.stop(true);vi.runAllTimers();
  expect(f.setters).toHaveLength(mounted);
  expect(f.page.__annotationMarkdownReaderStartupV1).toBeUndefined();
});

test("keeps a newly selected distant native row visible while deferred heights settle", () => {
  const f=pageFixture(); f.page.performance.now=()=>Date.now();
  const row=f.root.firstElementChild; row.classList.add("selected");
  f.root.getBoundingClientRect=()=>({top:100,bottom:700,height:600});
  let offset=2000;
  row.getBoundingClientRect=()=>({top:offset-f.root.scrollTop,bottom:offset+120-f.root.scrollTop,height:120});
  f.render(110,true); vi.advanceTimersByTime(1);
  expect(f.root.scrollTop).toBe(1420);
  offset+=400; vi.advanceTimersByTime(50);
  expect(f.root.scrollTop).toBe(1820);
  vi.advanceTimersByTime(3000);
  const settled=f.root.scrollTop; offset+=100;
  vi.advanceTimersByTime(100); expect(f.root.scrollTop).toBe(settled);
  f.runtime.stop(true);
});

test("manual wheel navigation cancels selected-row position correction", () => {
  const f=pageFixture(); f.page.performance.now=()=>Date.now();
  const row=f.root.firstElementChild; row.classList.add("selected");
  f.root.getBoundingClientRect=()=>({top:100,bottom:700,height:600});
  row.getBoundingClientRect=()=>({top:2000-f.root.scrollTop,bottom:2120-f.root.scrollTop,height:120});
  f.render(110,true); vi.advanceTimersByTime(1);
  document.dispatchEvent(new WheelEvent("wheel")); f.root.scrollTop=0;
  vi.advanceTimersByTime(100); expect(f.root.scrollTop).toBe(0);
  f.runtime.stop(true);
});
