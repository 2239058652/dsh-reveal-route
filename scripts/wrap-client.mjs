#!/usr/bin/env node
/**
 * 把 tsdown 产出的 CJS client bundle 包进 DSH 期望的自注册形态：
 * window.__ModuleLoader__.load({ id: "dsh-reveal-route", factory(require){...} })
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(dirname(fileURLToPath(import.meta.url)))
const cjsPath = join(SRC, 'lib', 'client', 'index.cjs')
const outPath = join(SRC, 'lib', 'client', 'index.js')
const id = 'dsh-reveal-route'

if (!existsSync(cjsPath)) {
  console.error('wrap-client: 找不到', cjsPath, '——请先 build')
  process.exit(1)
}

const cjs = readFileSync(cjsPath, 'utf8')
const wrapped =
  'window.__ModuleLoader__.load({\n' +
  `  id: ${JSON.stringify(id)},\n` +
  '  factory(require) {\n' +
  '    var module = { exports: {} };\n' +
  '    var exports = module.exports;\n' +
  cjs +
  '\n    return module.exports;\n' +
  '  }\n' +
  '});\n'

writeFileSync(outPath, wrapped, 'utf8')
rmSync(cjsPath, { force: true })
console.log(`wrap-client: ${id} 已包成 __ModuleLoader__ 自注册形态 -> lib/client/index.js (${wrapped.length} bytes)`)
