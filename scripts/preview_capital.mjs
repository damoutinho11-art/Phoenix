// Render the actual allocation component with the reviewed October example.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'pwa/package.json'))
const { build } = require('esbuild')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-capital-preview-'))
const bundle = path.join(directory, 'render.cjs')
const component = path.join(root, 'pwa/src/components/holo/subs/CapitalAllocationBreakdown.jsx').replaceAll('\\', '/')
const output = path.join(root, 'docs/reviews/2026-10-04-one-time-capital-preview.html')
try {
  await build({ stdin: { contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {CapitalAllocationBreakdown} from ${JSON.stringify(component)};
    console.log(renderToStaticMarkup(<CapitalAllocationBreakdown authority={{data_ready:true,
      approved_one_time_capital_eur:1255.46, regular_deployable_eur:1185.16,
      one_time_deployable_eur:1107.81}}/>));
  `, resolveDir: path.join(root, 'pwa'), loader: 'jsx' }, bundle: true, platform: 'node',
  format: 'cjs', jsx: 'automatic', outfile: bundle })
  const result = spawnSync(process.execPath, [bundle], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  fs.writeFileSync(output, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phoenix allocation preview</title><style>body{background:#010608;color:#d9edf2;font:14px Arial,sans-serif;margin:0}main{max-width:740px;margin:auto;padding:24px}h1{font-size:18px;color:#00cfff}section{border-top:1px solid #124551;border-bottom:1px solid #124551;padding:18px 0}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0}.metrics span{font-size:12px;color:#75a9b6}.metrics strong{display:block;font-size:23px;color:#00cfff;margin-top:6px}p{line-height:1.6}</style><main><h1>PHOENIX // FINANCE · BUDGET</h1><p>Review preview — not deployed. Existing Finance styling and layout remain unchanged.</p><section><span>CASH AUTHORITY · VERIFIED</span><div class="metrics"><div><span>DEPLOYABLE</span><strong>€2292.97</strong></div><div><span>WEEKLY</span><strong>€458.59</strong></div><div><span>WINDOWS</span><strong>5</strong></div></div>${result.stdout}<p>STATEMENT 2026-10-04 · PROTECTED €619.69</p></section><p>Before: €1185.16 deployable. After: €2292.97, including the usable part of the approved transfer. The €3800 emergency fund remains separate. No purchase is recorded.</p></main></html>`)
  console.log(output)
} finally {
  if (fs.existsSync(bundle)) fs.unlinkSync(bundle)
  fs.rmdirSync(directory)
}
