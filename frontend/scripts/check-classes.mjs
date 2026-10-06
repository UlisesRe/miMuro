import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const root = 'src'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = walk(root)
const markup = files.filter((f) => ['.js', '.html'].includes(extname(f)))
const styles = files.filter((f) => extname(f) === '.css')

// Classes referenced by templates.
const used = new Map()
for (const file of markup) {
  const src = readFileSync(file, 'utf8')
  const patterns = [/class="([^"]*)"/g, /:class="([^"]*)"/g]
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      for (const token of m[1].split(/\s+/)) {
        const name = token.trim().replace(/^['"]|['"]$/g, '')
        // Skip expression fragments leaking out of :class.
        if (!name || !/^-?[a-zA-Z][\w-]*$/.test(name)) continue
        if (!used.has(name)) used.set(name, file)
      }
    }
  }
}

// Classes actually defined by the stylesheets.
const defined = new Set()
for (const file of styles) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
    defined.add(m[1])
  }
}

const missing = [...used.entries()].filter(([name]) => !defined.has(name))
console.log(`templates: ${used.size} classes used | css: ${defined.size} selectors defined`)
if (!missing.length) {
  console.log('OK: every referenced class has a matching selector')
} else {
  console.log(`\nMISSING (${missing.length}):`)
  for (const [name, file] of missing) console.log(`  .${name}  <- ${file}`)
}
