// Load in the Zotero development bridge, then call with explicit local paths.
async function runSvgDegradationNativeQa({ root, expectedProfile } = {}) {
  if (typeof root !== "string" || typeof expectedProfile !== "string" || !root || !expectedProfile) {
    throw new Error("QA requires an explicit repository root and dedicated development profile.");
  }
  if (Zotero.Profile.dir !== expectedProfile) throw new Error("QA requires the dedicated development profile.");
  const nativePath = path => path.replaceAll("/", String.fromCharCode(92));
  const base = root.replaceAll(String.fromCharCode(92), "/").replace(/\/+$/, "") + "/";
  const output = base + "output/svg-degradation-assessment/";
  const rw = Zotero.Reader._readers[0]._iframeWindow;
  const baselineCode = await IOUtils.readUTF8(nativePath(output + "baseline.js"));
  const prototypeCode = await IOUtils.readUTF8(nativePath(output + "prototype.js"));
  const baselineApi = new Function("window", baselineCode + ";return CodexSvgAssessment;")(rw);
  const prototypeApi = new Function("window", prototypeCode + ";return CodexSvgDegradation;")(rw);
  const strict = baselineApi.createSvgRenderer(rw);
  const prototype = prototypeApi.createSvgDegradationPrototype(rw);
  const fixtures = [];
  for (const name of ["jordan", "efa-class-styles", "efa-font-shorthand"]) {
    fixtures.push({name, source: await IOUtils.readUTF8(nativePath(base + "tests/fixtures/" + name + ".svg"))});
  }
  const imageOf = html => {
    const box = rw.document.createElement("div"); box.innerHTML = html;
    return {box, image: box.querySelector(".annotation-markdown-svg-image")};
  };
  const compare = async (source, reference) => {
    const result = prototype(source, "<pre>source fallback</pre>");
    const {box, image} = imageOf(result.html);
    const original = rw.document.createElement("img");
    original.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(reference);
    await Promise.all([original.decode(), image.decode()]);
    const width = image.naturalWidth, height = image.naturalHeight;
    const pixels = candidate => {
      const canvas = rw.document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); context.drawImage(candidate, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const before = pixels(original), after = pixels(image);
    let changed = 0, maxDifference = 0;
    for (let i = 0; i < before.length; i += 4) {
      let different = false;
      for (let k = 0; k < 4; k++) {
        const delta = Math.abs(before[i+k] - after[i+k]);
        if (delta) { different = true; maxDifference = Math.max(maxDifference, delta); }
      }
      if (different) changed++;
    }
    return {status: result.status, dimensions: [width, height], pixels: before.length / 4,
      changedPixels: changed, maxChannelDifference: maxDifference,
      warningVisible: Boolean(box.querySelector(".annotation-markdown-svg-warning")),
      previewHasSVGNodes: box.querySelectorAll("svg,style,script").length, sourcePreserved: result.originalSource === source};
  };
  const comparisons = [];
  for (const {name, source} of fixtures) comparisons.push({name, ...await compare(source, source)});
  const source = fixtures[2].source;
  const degraded = source.replace('<svg ', '<svg shape-rendering="crispEdges" ')
    .replace('</svg>', '<style>.heading{cursor:default;text-rendering:optimizeLegibility}</style></svg>');
  comparisons.push({name: "efa-font-shorthand-degraded", ...await compare(degraded, source)});
  const rejected = source.replace('</svg>', '<style>.heading{cursor:default;fill:url(https://example.com/blocked.svg)}</style></svg>');
  const blocked = prototype(rejected, "<pre>source fallback</pre>");
  const timings = {baseline: [], complete: [], efaBaseline: [], efaComplete: [], degraded: []};
  for (let round = 0; round < 35; round++) {
    for (const {source} of fixtures) {
      let start = rw.performance.now(); strict(source, "<pre>source</pre>");
      if (round >= 5) timings.baseline.push(rw.performance.now() - start);
      start = rw.performance.now(); prototype(source, "<pre>source</pre>");
      if (round >= 5) timings.complete.push(rw.performance.now() - start);
    }
    let start = rw.performance.now(); strict(source, "<pre>source</pre>");
    if (round >= 5) timings.efaBaseline.push(rw.performance.now() - start);
    start = rw.performance.now(); prototype(source, "<pre>source</pre>");
    if (round >= 5) timings.efaComplete.push(rw.performance.now() - start);
    start = rw.performance.now(); prototype(degraded, "<pre>source</pre>");
    if (round >= 5) timings.degraded.push(rw.performance.now() - start);
  }
  const summarize = times => {
    times.sort((a,b)=>a-b);
    return {samples: times.length, medianMs: times[Math.floor(times.length/2)], p95Ms: times[Math.floor(times.length*.95)]};
  };
  const evidence = {engine: "Zotero " + Zotero.version + " / Gecko", profile: Zotero.Profile.dir,
    readerURL: rw.location.href, comparisons,
    blocked: {status: blocked.status, kind: blocked.kind, imageCount: imageOf(blocked.html).box.querySelectorAll("img").length},
    timings: Object.fromEntries(Object.entries(timings).map(([name,times])=>[name,summarize(times)]))};
  if (comparisons.some(row=>row.changedPixels || row.previewHasSVGNodes || !row.sourcePreserved) || blocked.status !== "fallback") {
    throw new Error("Native comparison or safety classification failed.");
  }
  await IOUtils.writeUTF8(nativePath(output + "native-evidence.json"), JSON.stringify(evidence, null, 2));
  return JSON.stringify(evidence);
}
