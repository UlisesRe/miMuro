import { readFileSync } from 'node:fs'

const files = [
  'src/components/WallOverlay.js',
  'src/pages/Dashboard.js',
  'src/components/AppTemplate.html'
]

// HTML void elements only. SVG shapes in this codebase are
// written with explicit close tags, so they must be counted
// as open+close pairs or the depth goes negative.
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr'])

const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

// Counts top-level element roots inside a template body,
// skipping nested <template> subtrees entirely.
function countRoots(body) {
  let depth = 0
  let roots = 0
  let skipDepth = 0
  tagRe.lastIndex = 0
  let m
  while ((m = tagRe.exec(body))) {
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    const selfClose = m[4] === '/' || VOID.has(name)
    if (name === 'template') {
      if (!closing && !selfClose) {
        if (skipDepth === 0 && depth === 0) {
          // a nested template at root level still counts as its own root? No —
          // x-if/x-for content is what Alpine keeps; the template tag itself
          // is not rendered. Skip its subtree, don't count it.
        }
        skipDepth++
        continue
      }
      if (closing) {
        skipDepth--
        continue
      }
      continue
    }
    if (skipDepth > 0) continue
    if (!closing && !selfClose) {
      if (depth === 0) roots++
      depth++
    } else if (closing) {
      depth--
    }
  }
  return roots
}

// Splits template bodies with proper nesting: an opening
// <template> starts a nested region closed by its matching </template>.
function forEachTemplate(src, fn) {
  const openRe = /<template\b[^>]*>/g
  let m
  while ((m = openRe.exec(src))) {
    const openStart = m.index
    const openEnd = openRe.lastIndex
    let depth = 1
    let i = openEnd
    const innerTagRe = /<(\/?)template\b[^>]*>/g
    innerTagRe.lastIndex = openEnd
    let n
    let closeStart = -1
    let closeEnd = -1
    while ((n = innerTagRe.exec(src))) {
      if (n[1] === '/') {
        depth--
        if (depth === 0) {
          closeStart = n.index
          closeEnd = innerTagRe.lastIndex
          break
        }
      } else {
        depth++
      }
    }
    if (closeStart === -1) continue
    const attrs = m[0]
    const body = src.slice(openEnd, closeStart)
    const kind = /x-if=/.test(attrs) ? 'if' : /x-for=/.test(attrs) ? 'for' : null
    if (kind) fn({ kind, attrs, body, start: openStart })
    openRe.lastIndex = closeEnd
  }
}

let bad = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  let count = 0
  forEachTemplate(src, ({ kind, body }) => {
    count++
    const roots = countRoots(body)
    if (roots !== 1) {
      bad++
      console.log(`MULTI-ROOT ${f} x-${kind} roots=${roots}`)
      console.log('  ' + body.trim().slice(0, 140).replace(/\s+/g, ' '))
    }
  })
  console.log(`scanned ${f}: ${count} x-if/x-for templates`)
}
console.log(bad === 0 ? 'OK: todos los x-if/x-for tienen raiz unica' : `FALLAS: ${bad}`)
