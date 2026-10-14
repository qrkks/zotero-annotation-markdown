import { afterEach, expect, test, vi } from "vitest";
import { createReaderTabLoadManager } from "../src/reader-tab-load.ts";

afterEach(()=>vi.useRealTimers());
function fixture(){
  let enabled=true,resolveInit;
  const init=new Promise(resolve=>{resolveInit=resolve;});
  const tabs={_tabs:[{id:"zotero-pane",type:"library"},{id:"book",type:"reader-loading",title:"Book",data:{itemID:10}}]};
  const win={Zotero_Tabs:tabs,closed:false};let currentWindow=win;
  const readers=[];
  const native=vi.fn(async(itemID,location,options)=>{await Promise.resolve();const reader={itemID,tabID:options?.tabID,_window:currentWindow,_isTabClosed:false,_initPromise:init};readers.push(reader);return reader;});
  const api={open:native,_readers:readers};
  const host={version:"10.0.6",Reader:api,getMainWindow:()=>currentWindow,Notifier:{registerObserver:vi.fn(()=>"load-observer"),unregisterObserver:vi.fn()}};
  const manager=createReaderTabLoadManager({host,isEnabled:()=>enabled});
  const options=()=>({tabID:"book",title:"Book",tabIndex:1,allowDuplicate:true,preventJumpback:true});
  return {manager,api,host,native,readers,win,tabs,options,resolveInit,disable:()=>{enabled=false;},setWindow:win=>{currentWindow=win;}};
}

test("overlapping native restores for one tab create only one Reader and retain the native promise",async()=>{
  const f=fixture();f.manager.refresh();
  const first=f.api.open(10,undefined,f.options()),second=f.api.open(10,undefined,f.options());
  expect(first).toBe(f.native.mock.results[0].value);expect(second).toBe(first);
  const reader=await first;expect(await second).toBe(reader);expect(f.native).toHaveBeenCalledOnce();
  expect(await f.api.open(10,undefined,f.options())).toBe(reader);
  f.resolveInit();await Promise.resolve();await Promise.resolve();
  f.tabs._tabs[1].type="reader";
  expect(await f.api.open(10,undefined,f.options())).toBe(reader);
  expect(f.readers).toHaveLength(1);f.manager.stop();
});

test("intentional duplicate tabs and separate windows retain separate loads",async()=>{
  const f=fixture();f.manager.refresh();
  f.tabs._tabs.push({...f.tabs._tabs[1],id:"second"});
  await Promise.all([f.api.open(10,undefined,f.options()),f.api.open(10,undefined,{...f.options(),tabID:"second",tabIndex:2})]);
  expect(f.native).toHaveBeenCalledTimes(2);
  const other={closed:false,Zotero_Tabs:{_tabs:f.tabs._tabs.map(t=>({...t}))}};f.setWindow(other);
  await f.api.open(10,undefined,f.options());expect(f.native).toHaveBeenCalledTimes(3);f.manager.stop();
});

test("explicit navigation, standalone windows, custom options and new tabs remain native",async()=>{
  const f=fixture();f.manager.refresh();
  const location={pageIndex:5};
  await f.api.open(10,location,f.options());await f.api.open(10,location,f.options());
  await f.api.open(10,undefined,{...f.options(),openInWindow:true});
  await f.api.open(10,undefined,{...f.options(),custom:true});
  await f.api.open(10,undefined,{...f.options(),tabID:"new"});
  expect(f.native).toHaveBeenCalledTimes(5);expect(f.native.mock.calls[0][1]).toBe(location);f.manager.stop();
});

test("a failed native open releases its guard and can be retried",async()=>{
  const f=fixture();f.native.mockRejectedValueOnce(new Error("load failed"));f.manager.refresh();
  const first=f.api.open(10,undefined,f.options()),second=f.api.open(10,undefined,f.options());
  await expect(first).rejects.toThrow("load failed");await expect(second).rejects.toThrow("load failed");
  await f.api.open(10,undefined,f.options());expect(f.native).toHaveBeenCalledTimes(2);f.manager.stop();
});

test("closing a loading tab removes its guard without cancelling the native promise",async()=>{
  const f=fixture();f.manager.refresh();const pending=f.api.open(10,undefined,f.options());const reader=await pending;
  f.tabs._tabs.splice(1);reader._isTabClosed=true;
  const observer=f.host.Notifier.registerObserver.mock.calls[0][0];observer.notify("close","tab",["book"]);
  expect(f.manager.status().pendingLoads).toBe(0);
  f.tabs._tabs.push({id:"book",type:"reader-unloaded",title:"Book",data:{itemID:10}});
  await f.api.open(10,undefined,f.options());expect(f.native).toHaveBeenCalledTimes(2);f.manager.stop();
});

test("disable restores owned APIs and does not erase later foreign wrappers",async()=>{
  const f=fixture();f.manager.refresh();const own=f.api.open;
  const later=function(...args){return Reflect.apply(own,this,args);};f.api.open=later;
  f.disable();f.manager.refresh();expect(f.api.open).toBe(later);
  await Promise.all([f.api.open(10,undefined,f.options()),f.api.open(10,undefined,f.options())]);
  expect(f.native).toHaveBeenCalledTimes(2);expect(f.host.Notifier.unregisterObserver).toHaveBeenCalledWith("load-observer");
});

test("frozen, unsupported and borrowed APIs keep native behavior",async()=>{
  const f=fixture();Object.freeze(f.api);f.manager.refresh();expect(f.api.open).toBe(f.native);
  const old=fixture();old.host.version="9.0";old.manager.refresh();expect(old.api.open).toBe(old.native);
  const borrowed=fixture();borrowed.manager.refresh();await borrowed.api.open.call({},10,undefined,borrowed.options());
  expect(borrowed.native).toHaveBeenCalledOnce();borrowed.manager.stop();
});

test("a foreign wrapper retaining an old hook stays safe after rearming",async()=>{
  const f=fixture();f.manager.refresh();const own=f.api.open;
  f.api.open=function(...args){return Reflect.apply(own,this,args);};
  f.manager.stop();f.manager.refresh();
  const [a,b]=await Promise.all([f.api.open(10,undefined,f.options()),f.api.open(10,undefined,f.options())]);
  expect(a).toBe(b);expect(f.native).toHaveBeenCalledOnce();f.manager.stop();
});

test("native synchronous failures are propagated once, including unsupported requests",()=>{
  const f=fixture();f.manager.refresh();f.native.mockImplementation(()=>{throw new Error("native failed");});
  expect(()=>f.api.open(10,undefined,f.options())).toThrow("native failed");
  expect(()=>f.api.open(10,undefined,{...f.options(),custom:true})).toThrow("native failed");
  expect(f.native).toHaveBeenCalledTimes(2);f.manager.stop();
});

test("old initialization completion cannot clear a newly armed load",async()=>{
  const f=fixture();f.manager.refresh();const old=await f.api.open(10,undefined,f.options());
  old._isTabClosed=true;f.manager.stop();
  let resolveNew;const nextInit=new Promise(resolve=>{resolveNew=resolve;});
  f.native.mockImplementation(async(itemID,location,options)=>{const reader={itemID,tabID:options.tabID,_window:f.win,_isTabClosed:false,_initPromise:nextInit};f.readers.push(reader);return reader;});
  f.manager.refresh();await f.api.open(10,undefined,f.options());
  f.resolveInit();await Promise.resolve();await Promise.resolve();
  expect(f.manager.status().pendingLoads).toBe(1);
  resolveNew();await vi.waitFor(()=>expect(f.manager.status().pendingLoads).toBe(0));f.manager.stop();
});

test("native null secondary-view state reuses the existing single-view Reader",async()=>{
  const f=fixture();f.tabs._tabs[1].data.secondViewState=null;f.manager.refresh();
  const options=()=>({...f.options(),secondViewState:null});
  const reader=await f.api.open(10,undefined,options());f.resolveInit();
  await vi.waitFor(()=>expect(f.manager.status().pendingLoads).toBe(0));
  expect(await f.api.open(10,undefined,options())).toBe(reader);
  expect(f.native).toHaveBeenCalledOnce();f.manager.stop();
});
