<template>
  <div class="page">
    <div class="toolbar">
      <button @mousedown.prevent="applyBold">加粗</button>
      <button @mousedown.prevent="applyItalic">斜体</button>
      <button @mousedown.prevent="applyCode">代码</button>
      <button @mousedown.prevent="insertHeading">标题</button>
      <button @mousedown.prevent="insertQuote">引用</button>
      <button @mousedown.prevent="insertLink">链接</button>
      <button @mousedown.prevent="insertFormula">公式块</button>
    </div>
    <div class="panes">
      <textarea
        ref="textareaRef"
        v-model="content"
        class="input"
        placeholder="在左侧输入 Markdown..."
      ></textarea>
      <div class="preview" v-html="renderedHtml"></div>
    </div>
  </div>
  
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import mark from 'markdown-it-mark'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

function resolvePlugin(p) {
  if (!p) return null
  if (typeof p === 'function') return p
  if (p.default && typeof p.default === 'function') return p.default
  if (p.plugin && typeof p.plugin === 'function') return p.plugin
  return null
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight: (str, lang) => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        return `<pre><code class="hljs language-${lang}">${out}</code></pre>`
      } else {
        const out = hljs.highlightAuto(str).value
        return `<pre><code class="hljs">${out}</code></pre>`
      }
    } catch (e) {
      return `<pre><code>${escapeHtml(str)}</code></pre>`
    }
  }
})

const mk = resolvePlugin(mark)
if (mk) md.use(mk)
const tm = resolvePlugin(texmath)
if (tm) md.use(tm, { engine: katex, delimiters: 'dollars', katexOptions: { strict: false } })

const content = ref('')

function sanitizeBuggyTokens(s) {
  if (!s) return ''
  // 清理历史残留：undefined选中内容undefined -> **选中内容**
  return String(s).replace(/undefined([^\n]+?)undefined/g, '**$1**')
}

const renderedHtml = computed(() => md.render(sanitizeBuggyTokens(content.value || '')))

const textareaRef = ref(null)
onMounted(() => {
  textareaRef.value?.focus()
})

function wrapSelection(prefix, suffix, placeholder = '') {
  prefix = String(prefix ?? '')
  suffix = String(suffix ?? '')
  placeholder = String(placeholder ?? '')

  const el = textareaRef.value
  if (!el) return
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const hasSelection = start !== end
  const selected = hasSelection ? content.value.slice(start, end) : ''

  if (hasSelection) {
    const before = content.value.slice(0, start)
    const after = content.value.slice(end)
    content.value = before + prefix + selected + suffix + after
    const pos = start + prefix.length + selected.length + suffix.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  } else {
    const insert = prefix + (placeholder || '') + suffix
    const before = content.value.slice(0, start)
    const after = content.value.slice(start)
    content.value = before + insert + after
    const cursorStart = start + prefix.length
    const cursorEnd = cursorStart + (placeholder ? placeholder.length : 0)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursorStart, cursorEnd)
    })
  }
}

function applyBold() {
  wrapSelection('**', '**', '加粗文本')
}
function applyItalic() {
  wrapSelection('*', '*', '斜体文本')
}
function applyCode() {
  wrapSelection('`', '`', '代码')
}
function insertHeading() {
  wrapSelection('# ', '', '标题')
}
function insertQuote() {
  wrapSelection('> ', '', '引用')
}
function insertLink() {
  const el = textareaRef.value
  const start = el?.selectionStart ?? 0
  const end = el?.selectionEnd ?? 0
  const selected = start !== end ? content.value.slice(start, end) : '链接文本'
  const markdown = `[${selected}](https://example.com)`
  const before = content.value.slice(0, start)
  const after = content.value.slice(end)
  content.value = before + markdown + after
  const newPos = before.length + markdown.length
  requestAnimationFrame(() => {
    el?.focus()
    el?.setSelectionRange(newPos, newPos)
  })
}
function insertFormula() {
  const sample = `\n$$\nE = mc^2\n$$\n`
  const el = textareaRef.value
  const pos = el?.selectionStart ?? content.value.length
  const before = content.value.slice(0, pos)
  const after = content.value.slice(pos)
  content.value = before + sample + after
  requestAnimationFrame(() => {
    el?.focus()
    const newPos = pos + sample.length
    el?.setSelectionRange(newPos, newPos)
  })
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #e5e7eb; background: #fafafa; position: sticky; top: 0; z-index: 1; }
.toolbar button { padding: 6px 10px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
.toolbar button:hover { background: #f3f4f6; }
.panes { display: grid; grid-template-columns: 1fr 1fr; height: calc(100% - 44px); }
.input { width: 100%; height: 100%; border: none; outline: none; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 14px; resize: none; border-right: 1px solid #e5e7eb; }
.preview { padding: 16px; overflow: auto; }
.preview pre { background: #f8f9fa; border: 1px solid #eceff1; border-radius: 6px; }
.preview pre code { line-height: 1.6; }
.preview h1, .preview h2, .preview h3 { margin: 16px 0 8px; }
.preview p { margin: 10px 0; }
.preview code { padding: 2px 4px; background: #f3f4f6; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.preview pre code { display: block; padding: 12px; }
.preview ul, .preview ol { padding-left: 24px; }
.preview :deep(strong), .preview :deep(b) { font-weight: 700; }
.preview :deep(em), .preview :deep(i) { font-style: italic; }
.preview :deep(.katex) { font-size: 1em; }
.preview table { border-collapse: collapse; }
.preview table th, .preview table td { border: 1px solid #e5e7eb; padding: 6px 10px; }
</style>