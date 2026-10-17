# Singular value decomposition

$A=U\Sigma V^{\mathsf T}$ maps the unit circle to an ellipse.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="760" viewBox="0 0 760 760" role="img" aria-labelledby="title" aria-describedby="desc">
  <title id="title">Singular value decomposition</title>
  <desc id="desc">Clockwise: V transpose changes basis, Sigma stretches by 1.6 and 0.7, and U gives the output ellipse. The colored vectors satisfy A v_i = sigma_i u_i.</desc>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 5L0 10" fill="none" stroke="#64748b" stroke-width="2"/></marker>
    <marker id="blue" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 5L0 10Z" fill="#2563eb"/></marker>
    <marker id="orange" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 5L0 10Z" fill="#d97706"/></marker>
  </defs>
  <rect width="760" height="760" fill="#ffffff"/>
  <g font-family="Georgia, Times New Roman, serif" fill="#0f172a" text-anchor="middle">
    <text x="380" y="52" font-size="36" font-style="italic">A = UΣVᵀ</text>
    <text x="380" y="86" font-size="21" fill="#64748b">σ₁ = 1.6 · σ₂ = 0.7</text>
  </g>
  <g fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5">
    <rect x="50" y="120" width="300" height="270" rx="12"/>
    <rect x="410" y="120" width="300" height="270" rx="12"/>
    <rect x="410" y="445" width="300" height="270" rx="12"/>
    <rect x="50" y="445" width="300" height="270" rx="12"/>
  </g>
  <g font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="bold" fill="#334155">
    <text x="72" y="154">0 · Unit circle</text>
    <text x="432" y="154">1 · Change basis</text>
    <text x="432" y="479">2 · Stretch</text>
    <text x="72" y="479">3 · Output ellipse</text>
  </g>
  <g fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)">
    <path d="M362 250H398"/>
    <path d="M560 399V436"/>
    <path d="M398 575H362"/>
    <path d="M200 399V436" stroke-dasharray="4 5"/>
  </g>
  <g font-family="Georgia, Times New Roman, serif" font-size="24" font-style="italic" fill="#334155" text-anchor="middle">
    <text x="380" y="234">Vᵀ</text><text x="589" y="426">Σ</text>
    <text x="380" y="559">U</text><text x="172" y="426">A</text>
  </g>
  <g transform="translate(200 250) scale(1 -1)">
    <circle r="64" fill="#eff6ff"/>
    <path d="M-64-64V64M-32-64V64M0-64V64M32-64V64M64-64V64M-64-64H64M-64-32H64M-64 0H64M-64 32H64M-64 64H64" fill="none" stroke="#dbe4ef"/>
    <path d="M-127 0H127M0-105V88" stroke="#cbd5e1"/>
    <circle r="64" fill="none" stroke="#475569" stroke-width="2"/>
    <path d="M0 0L55.426 32" stroke="#2563eb" stroke-width="3" marker-end="url(#blue)"/>
    <path d="M0 0L-32 55.426" stroke="#d97706" stroke-width="3" marker-end="url(#orange)"/>
  </g>
  <g transform="translate(560 250) scale(1 -1)">
    <circle r="64" fill="#eff6ff"/>
    <path d="M-64-64V64M-32-64V64M0-64V64M32-64V64M64-64V64M-64-64H64M-64-32H64M-64 0H64M-64 32H64M-64 64H64" transform="rotate(-30)" fill="none" stroke="#dbe4ef"/>
    <path d="M-127 0H127M0-105V88" stroke="#cbd5e1"/>
    <circle r="64" fill="none" stroke="#475569" stroke-width="2"/>
    <path d="M0 0H64" stroke="#2563eb" stroke-width="3" marker-end="url(#blue)"/>
    <path d="M0 0V64" stroke="#d97706" stroke-width="3" marker-end="url(#orange)"/>
  </g>
  <g transform="translate(560 575) scale(1 -1)">
    <ellipse rx="102.4" ry="44.8" fill="#eff6ff"/>
    <path d="M-64-64V64M-32-64V64M0-64V64M32-64V64M64-64V64M-64-64H64M-64-32H64M-64 0H64M-64 32H64M-64 64H64" transform="scale(1.6 .7) rotate(-30)" fill="none" stroke="#dbe4ef"/>
    <path d="M-140 0H140M0-105V88" stroke="#cbd5e1"/>
    <ellipse rx="102.4" ry="44.8" fill="none" stroke="#475569" stroke-width="2"/>
    <path d="M0 0H102.4" stroke="#2563eb" stroke-width="3" marker-end="url(#blue)"/>
    <path d="M0 0V44.8" stroke="#d97706" stroke-width="3" marker-end="url(#orange)"/>
  </g>
  <g transform="translate(200 575) scale(1 -1)">
    <ellipse rx="102.4" ry="44.8" transform="rotate(35)" fill="#eff6ff"/>
    <path d="M-64-64V64M-32-64V64M0-64V64M32-64V64M64-64V64M-64-64H64M-64-32H64M-64 0H64M-64 32H64M-64 64H64" transform="rotate(35) scale(1.6 .7) rotate(-30)" fill="none" stroke="#dbe4ef"/>
    <path d="M-140 0H140M0-105V88" stroke="#cbd5e1"/>
    <ellipse rx="102.4" ry="44.8" transform="rotate(35)" fill="none" stroke="#475569" stroke-width="2"/>
    <path d="M0 0L83.881 58.734" stroke="#2563eb" stroke-width="3" marker-end="url(#blue)"/>
    <path d="M0 0L-25.696 36.698" stroke="#d97706" stroke-width="3" marker-end="url(#orange)"/>
  </g>
  <g font-family="Georgia, Times New Roman, serif" font-size="22" font-style="italic">
    <text x="261" y="212" fill="#2563eb">v₁</text><text x="145" y="188" fill="#d97706">v₂</text>
    <text x="631" y="242" fill="#2563eb">e₁</text><text x="572" y="183" fill="#d97706">e₂</text>
    <text x="660" y="601" fill="#2563eb">σ₁e₁</text><text x="572" y="518" fill="#d97706">σ₂e₂</text>
    <text x="281" y="508" fill="#2563eb">σ₁u₁</text><text x="116" y="529" fill="#d97706">σ₂u₂</text>
  </g>
  <g font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#64748b" text-anchor="middle">
    <text x="200" y="375">Input singular vectors</text><text x="560" y="375">Vᵀvᵢ = eᵢ</text>
    <text x="560" y="700">Σeᵢ = σᵢeᵢ</text><text x="200" y="700">Avᵢ = σᵢuᵢ</text>
  </g>
</svg>
```
