import { afterEach, expect, test, vi } from "vitest";
import { createReaderStartupSessionManager, deferSavedReaderSelection, restoreSavedReaderSelection, STARTUP_SELECTION_KEY } from "../src/reader-startup-session.ts";

afterEach(()=>vi.useRealTimers());
const file="C:\\QA\\Profile\\session.json";
function state(){return {windows:[{type:"pane",custom:"kept",tabs:[{type:"library",title:"Library",selected:false},{type:"reader",title:"Book",selected:true,data:{itemID:10,custom:12}},{type:"reader",title:"Other",data:{itemID:11}}]}],other:{kept:true}};}
const text=()=>JSON.stringify(state());
function fixture(enabled=true){
  vi.useFakeTimers();
  const data=JSON.parse(deferSavedReaderSelection(text(),()=>423));
  const listeners=new Map();
  const tabs={selectedID:"zotero-pane",_tabs:[{id:"zotero-pane",type:"library"},{id:"book",type:"reader-unloaded",data:{itemID:10}}],select:vi.fn(id=>{tabs.selectedID=id;})};
  const win={Zotero_Tabs:tabs,setTimeout,clearTimeout,requestAnimationFrame:cb=>setTimeout(cb,16),cancelAnimationFrame:clearTimeout,addEventListener:vi.fn((type,fn)=>listeners.set(type,fn)),removeEventListener:vi.fn((type)=>listeners.delete(type))};
  const put=vi.fn(()=>Promise.resolve("written")),save=vi.fn(()=>Promise.resolve());
  const host={version:"10.0.6",Profile:{dir:"C:\\QA\\Profile"},File:{putContentsAsync:put},Session:{state:data,save},getMainWindows:()=>[win]};
  const manager=createReaderStartupSessionManager({host,isEnabled:()=>enabled,getAnnotationCount:()=>423});
  return {manager,host,put,save,data,win,tabs,listeners,disable:()=>{enabled=false;}};
}

test("defers only the selected large Reader and preserves every tab and its data",()=>{
  const original=state(),changed=JSON.parse(deferSavedReaderSelection(JSON.stringify(original),()=>423));
  expect(changed.windows[0].tabs.map(t=>t.type)).toEqual(["library","reader","reader"]);
  expect(changed.windows[0].tabs[0].selected).toBe(true);
  expect(changed.windows[0].tabs[1].selected).toBeUndefined();
  expect(changed.windows[0].tabs[1].data).toEqual(original.windows[0].tabs[1].data);
  expect(JSON.parse(restoreSavedReaderSelection(JSON.stringify(changed)))).toEqual(original);
  expect(original.windows[0].tabs[1].selected).toBe(true);
});

test("small, inactive, malformed and standalone-window sessions remain unchanged",()=>{
  expect(deferSavedReaderSelection(text(),()=>19)).toBe(text());
  const library=state();delete library.windows[0].tabs[1].selected;library.windows[0].tabs[0].selected=true;
  const source=JSON.stringify(library);expect(deferSavedReaderSelection(source,()=>423)).toBe(source);
  const standalone=JSON.stringify({windows:[{type:"reader",itemID:10}]});
  expect(deferSavedReaderSelection(standalone,()=>423)).toBe(standalone);
  expect(deferSavedReaderSelection("bad",()=>423)).toBe("bad");
  expect(deferSavedReaderSelection(text(),()=>{throw new Error("items unavailable");})).toBe(text());
});

test("saved selection markers are idempotent and unknown marker versions are left alone",()=>{
  const once=deferSavedReaderSelection(text(),()=>423);
  expect(deferSavedReaderSelection(once,()=>423)).toBe(once);
  const unknown=state();unknown.windows[0][STARTUP_SELECTION_KEY]={version:99};
  const source=JSON.stringify(unknown);expect(deferSavedReaderSelection(source,()=>423)).toBe(source);
  expect(restoreSavedReaderSelection(source)).toBe(source);
});

test("writes only transform the exact native session path and preserve native return values",async()=>{
  const f=fixture(),promise=Promise.resolve("native");f.put.mockReturnValue(promise);
  f.manager.refresh();
  expect(f.host.File.putContentsAsync(file,text(),"extra")).toBe(promise);
  expect(JSON.parse(f.put.mock.calls[0][1]).windows[0][STARTUP_SELECTION_KEY].itemID).toBe(10);
  f.host.File.putContentsAsync("C:\\QA\\Other\\session.json",text());
  expect(f.put.mock.calls[1][1]).toBe(text());
  expect(f.put.mock.calls[0][2]).toBe("extra");
  f.manager.stop(true);expect(f.host.File.putContentsAsync).toBe(f.put);
  expect(f.save).not.toHaveBeenCalled();
});

test("disable restores native persistence and a later foreign writer wrapper survives cleanup",()=>{
  const f=fixture();f.manager.refresh();const own=f.host.File.putContentsAsync;
  const later=function(...args){return own.apply(this,args);};f.host.File.putContentsAsync=later;
  f.disable();f.manager.refresh();
  expect(f.host.File.putContentsAsync).toBe(later);expect(f.save).toHaveBeenCalledOnce();
  f.host.File.putContentsAsync(file,text());expect(f.put.mock.calls[0][1]).toBe(text());
});

test("frozen or unsupported host APIs keep native persistence",()=>{
  const f=fixture();Object.freeze(f.host.File);expect(()=>f.manager.refresh()).not.toThrow();
  expect(f.host.File.putContentsAsync).toBe(f.put);f.manager.stop(true);
  const old=fixture();old.host.version="9.0";old.manager.refresh();expect(old.host.File.putContentsAsync).toBe(old.put);
});

test("restores the original Reader after library frame opportunities without changing tab order",async()=>{
  const f=fixture();f.manager.refresh();const order=f.tabs._tabs.map(t=>t.id);
  const pending=f.manager.restore();await vi.advanceTimersByTimeAsync(100);
  await pending;expect(f.tabs.select).toHaveBeenCalledWith("book");
  expect(f.tabs._tabs.map(t=>t.id)).toEqual(order);
  expect(f.data.windows[0][STARTUP_SELECTION_KEY]).toBeUndefined();
  expect(f.data.windows[0].tabs[1].selected).toBe(true);
  expect(f.listeners.size).toBe(0);f.manager.stop(true);
});

test("automatic restoration does not steal selection after the user chooses another tab",async()=>{
  const f=fixture();f.tabs.selectedID="other";f.manager.refresh();
  await f.manager.restore();expect(f.tabs.select).not.toHaveBeenCalled();f.manager.stop(true);
});

test("a user gesture while waiting cancels the automatic selection",async()=>{
  const f=fixture();f.manager.refresh();const pending=f.manager.restore();
  await vi.advanceTimersByTimeAsync(1);f.listeners.get("pointerdown")?.();
  await vi.advanceTimersByTimeAsync(100);await pending;
  expect(f.tabs.select).not.toHaveBeenCalled();expect(f.listeners.size).toBe(0);f.manager.stop(true);
});

test("disable cancels pending restoration and cleans timers and listeners",async()=>{
  const f=fixture();f.manager.refresh();const pending=f.manager.restore();
  await vi.advanceTimersByTimeAsync(1);f.disable();f.manager.refresh();
  await vi.advanceTimersByTimeAsync(100);await pending;
  expect(f.tabs.select).not.toHaveBeenCalled();expect(f.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("an owned previous-session selection is recovered even when the option is now off",async()=>{
  const f=fixture(false);f.manager.refresh();const pending=f.manager.restore();
  await vi.advanceTimersByTimeAsync(100);await pending;
  expect(f.tabs.select).toHaveBeenCalledWith("book");expect(f.host.File.putContentsAsync).toBe(f.put);
  f.manager.stop(true);
});

test("concurrent restoration shares one selection when the native selector is asynchronous",async()=>{
  const f=fixture();f.tabs.select.mockImplementation(()=>Promise.resolve());f.manager.refresh();
  const first=f.manager.restore(),second=f.manager.restore();
  await vi.advanceTimersByTimeAsync(100);await Promise.all([first,second]);
  expect(f.tabs.select).toHaveBeenCalledOnce();f.manager.stop(true);
});

test("selects an already-loading restored tab without starting a second load",async()=>{
  const f=fixture();f.tabs._tabs[1].type="reader-loading";f.manager.refresh();
  const pending=f.manager.restore();await vi.advanceTimersByTimeAsync(100);await pending;
  expect(f.tabs.select).toHaveBeenCalledWith("book");f.manager.stop(true);
});

test("restores the saved tab index when two intentional tabs show the same item",async()=>{
  const f=fixture();f.data.windows[0].tabs[2].data.itemID=10;
  f.data.windows[0][STARTUP_SELECTION_KEY].readerIndex=2;
  f.tabs._tabs.push({id:"duplicate",type:"reader-unloaded",data:{itemID:10}});f.manager.refresh();
  const pending=f.manager.restore();await vi.advanceTimersByTimeAsync(100);await pending;
  expect(f.tabs.select).toHaveBeenCalledWith("duplicate");f.manager.stop(true);
});
