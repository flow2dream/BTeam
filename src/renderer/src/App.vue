<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import MarkdownEditor from './pages/MarkdownEditor.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const basePath = ref('')
const currentView = ref('explorer') // 'explorer' | 'md'
const currentPath = ref('')
const items = ref([])
const loading = ref(false)

// 格式化文件大小为带单位的字符串
function formatSize(size) {
  const n = Number(size)
  if (!Number.isFinite(n)) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = n
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  const display = i === 0 ? Math.round(val).toString() : (val < 10 ? val.toFixed(2) : val.toFixed(1))
  return `${display} ${units[i]}`
}

async function loadBase() {
    contextMenuVisible.value = false
  if (!window.api || !window.api.fs) {
    ElMessage.warning('未检测到 Electron 环境，当前为界面预览模式')
    return
  }
  basePath.value = await window.api.fs.getBase()
  await loadDir(basePath.value)
}

async function loadDir(dir) {
    contextMenuVisible.value = false
  if (!window.api || !window.api.fs) return
  loading.value = true
  try {
    const res = await window.api.fs.listDir(dir)
    currentPath.value = res.path
    items.value = res.items
  } catch (e) {
    ElMessage.error('加载目录失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

function enter(row) {
    contextMenuVisible.value = false
  if (row.isDirectory) loadDir(row.path)
}

function goRoot() {
    contextMenuVisible.value = false
  if (basePath.value) loadDir(basePath.value)
}

function goUp() {
    contextMenuVisible.value = false
  const p = currentPath.value
  if (!p || !basePath.value) return
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  const parent = idx > 0 ? p.slice(0, idx) : p
  if (parent.length < basePath.value.length) return
  if (!parent.startsWith(basePath.value)) return
  loadDir(parent)
}

async function createFolder() {
    contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('请输入新建文件夹名称', '新建文件夹', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /[^\\/:*?"<>|]+/,
      inputErrorMessage: '名称不合法'
    })
    await window.api.fs.createDir(currentPath.value, value)
    ElMessage.success('创建成功')
    loadDir(currentPath.value)
  } catch (_) {
    // canceled or failed
  }
}

// ---------- 文件相关操作 ----------
const viewerVisible = ref(false)
const editorVisible = ref(false)
const viewContent = ref('')
const editContent = ref('')
const selectedFile = ref(null)

// 新建文件对话框与常见后缀
const newFileVisible = ref(false)
const newFileName = ref('')
const newFileExt = ref('txt')
const newFileTargetDir = ref('')
const commonFileExts = [
  'txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'vue',
  'py', 'java', 'c', 'cpp', 'csv', 'xml', 'yaml', 'yml', 'log'
]

function buildFileName(base, ext) {
  const b = (base ?? '').trim()
  if (!b) return null
  const illegal = /[\\\/:*?"<>|]/
  if (illegal.test(b)) throw new Error('名称包含非法字符')
  const e = (ext ?? '').toString().trim().replace(/^\.+/, '')
  if (!e || b.includes('.')) return b
  return `${b}.${e}`
}

const previewFileName = computed(() => {
  try {
    return buildFileName(newFileName.value, newFileExt.value) || ''
  } catch {
    return '名称不合法'
  }
})

function createFile() {
    contextMenuVisible.value = false
  newFileTargetDir.value = currentPath.value
  newFileName.value = ''
  newFileExt.value = 'txt'
  newFileVisible.value = true
}

async function confirmCreateFile() {
    contextMenuVisible.value = false
  try {
    const finalName = buildFileName(newFileName.value, newFileExt.value)
    if (!finalName) throw new Error('请输入文件名')
    const parent = newFileTargetDir.value || currentPath.value
    await window.api.fs.createFile(parent, finalName, '')
    newFileVisible.value = false
    ElMessage.success('文件创建成功')
    loadDir(currentPath.value)
  } catch (e) {
    ElMessage.error('创建失败：' + (e?.message || e))
  }
}

function openNewFileDialogInDir(dir) {
    contextMenuVisible.value = false
  newFileTargetDir.value = dir || currentPath.value
  newFileName.value = ''
  newFileExt.value = 'txt'
  newFileVisible.value = true
}

async function createFolderAt(dir) {
    contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('请输入新建文件夹名称', '新建文件夹', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /[^\\/:*?"<>|]+/,
      inputErrorMessage: '名称不合法'
    })
    const parent = dir || currentPath.value
    await window.api.fs.createDir(parent, value)
    ElMessage.success('创建成功')
    loadDir(currentPath.value)
  } catch (_) {
    // canceled or failed
  }
}

async function viewFile(row) {
    contextMenuVisible.value = false
  try {
    if (!row || row.isDirectory) return
    if (!window.api || !window.api.fs) {
      ElMessage.error('当前为浏览器预览，无法读取文件')
      return
    }
    const content = await window.api.fs.readFile(row.path)
    viewContent.value = content
    selectedFile.value = row
    viewerVisible.value = true
  } catch (e) {
    ElMessage.error('读取文件失败：' + (e?.message || e))
  }
}

async function editFile(row) {
    contextMenuVisible.value = false
  try {
    if (!row || row.isDirectory) return
    if (!window.api || !window.api.fs) {
      ElMessage.error('当前为浏览器预览，无法读取文件')
      return
    }
    const content = await window.api.fs.readFile(row.path)
    editContent.value = content
    selectedFile.value = row
    editorVisible.value = true
  } catch (e) {
    ElMessage.error('读取文件失败：' + (e?.message || e))
  }
}

async function saveFile() {
    contextMenuVisible.value = false
  try {
    if (!selectedFile.value) return
    if (!window.api || !window.api.fs) {
      ElMessage.error('当前为浏览器预览，无法写入文件')
      return
    }
    await window.api.fs.writeFile(selectedFile.value.path, editContent.value)
    editorVisible.value = false
    ElMessage.success('保存成功')
    loadDir(currentPath.value)
  } catch (e) {
    ElMessage.error('写入文件失败：' + (e?.message || e))
  }
}

async function openExternal(row) {
    contextMenuVisible.value = false
  try {
    if (!row) return
    if (!window.api || !window.api.fs) {
      ElMessage.error('当前为浏览器预览，无法系统打开')
      return
    }
    // 文件使用默认应用打开；文件夹则直接打开目录
    const isDir = !!row.isDirectory
    if (isDir) {
      await window.api.fs.openExternal(row.path)
    } else {
      await window.api.fs.openExternal(row.path)
    }
  } catch (e) {
    ElMessage.error('打开失败：' + (e?.message || e))
  }
}

async function revealInFolder(row) {
    contextMenuVisible.value = false
  try {
    if (!row) return
    if (!window.api || !window.api.fs) {
      ElMessage.error('当前为浏览器预览，无法打开资源管理器')
      return
    }
    await window.api.fs.revealInFolder(row.path)
  } catch (e) {
    ElMessage.error('打开资源管理器失败：' + (e?.message || e))
  }
}

async function deleteEntry(row) {
    contextMenuVisible.value = false
  try {
    await ElMessageBox.confirm(`确认删除 ${row.name}？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await window.api.fs.delete(row.path)
    ElMessage.success('删除成功')
    loadDir(currentPath.value)
  } catch (_) {
    // canceled or failed
  }
}

async function renameEntry(row) {
  contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('重命名为', '重命名', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: row.name,
      inputPattern: /[^\\/:*?"<>|]+/,
      inputErrorMessage: '名称不合法'
    })
    await window.api.fs.rename(row.path, value)
    ElMessage.success('重命名成功')
    loadDir(currentPath.value)
    
  } catch (_) {
    // canceled or failed
  }
}

onMounted(() => loadBase())

// 右键菜单相关状态与逻辑
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuRow = ref(null)

function onRowContextMenu(row, _column, event) {
  event.preventDefault()
  contextMenuRow.value = row
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

function hideContextMenu() {
  contextMenuVisible.value = false
}

function onRowDblClick(row) {
  if (row?.isDirectory) {
    enter(row)
  } else {
    editFile(row)
  }
}

onMounted(() => {
  window.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('click', hideContextMenu)
})
</script>

<template>
  <el-container v-if="currentView === 'explorer'" style="height: 100%; width: 100%;">
    <el-header class="toolbar">
      <div class="toolbar-left">
        <el-dropdown split-button type="success" @click="createFolder">
          新建文件夹
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item class="new-file-item" @click="createFile">新建文件</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="toolbar-right">
        <el-button @click="currentView = 'md'">Markdown编辑器</el-button>
        <el-button type="primary" @click="goUp">返回上一级</el-button>
        <el-button @click="goRoot">回到根目录</el-button>
      </div>
    </el-header>
    <el-main style="height: calc(100% - 60px);">
      <div class="table-wrap">
        <el-table :data="items" v-loading="loading" @row-dblclick="onRowDblClick" @row-contextmenu="onRowContextMenu" style="width: 100%; height: 100%;">
          <el-table-column prop="name" label="名称" />
          <el-table-column label="类型" width="100">
            <template #default="{ row }">{{ row.isDirectory ? '文件夹' : '文件' }}</template>
          </el-table-column>
          <el-table-column label="大小" width="160">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column label="修改时间" width="180">
            <template #default="{ row }">{{ new Date(row.mtime).toLocaleString() }}</template>
          </el-table-column>
        
        </el-table>
      </div>

      <!-- 右键菜单 -->
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <template v-if="contextMenuRow && contextMenuRow.isDirectory">
          <div class="menu-item" @click="enter(contextMenuRow)">打开</div>
          <div class="menu-item" @click="createFile">新建文件</div>
          <div class="menu-item" @click="createFolder">新建文件夹</div>
          <div class="menu-item" @click="revealInFolder(contextMenuRow)">在资源管理器中打开</div>
          <div class="menu-item" @click="renameEntry(contextMenuRow)">重命名</div>
          <div class="menu-item danger" @click="deleteEntry(contextMenuRow)">删除</div>
        </template>
        <template v-else>
          <div class="menu-item" @click="viewFile(contextMenuRow)">查看</div>
          <div class="menu-item" @click="editFile(contextMenuRow)">编辑</div>
          <div class="menu-item" @click="openExternal(contextMenuRow)">系统打开</div>
          <div class="menu-item" @click="createFile">新建文件</div>
          <div class="menu-item" @click="createFolder">新建文件夹</div>
          <div class="menu-item" @click="revealInFolder(contextMenuRow)">在资源管理器中打开</div>
          <div class="menu-item" @click="renameEntry(contextMenuRow)">重命名</div>
          <div class="menu-item danger" @click="deleteEntry(contextMenuRow)">删除</div>
        </template>
      </div>

      <!-- 新建文件（指定后缀） -->
      <el-dialog v-model="newFileVisible" title="新建文件" width="500px">
        <el-form label-width="90px">
          <el-form-item label="文件名">
            <el-input v-model="newFileName" placeholder="不含后缀的名称或完整文件名" />
          </el-form-item>
          <el-form-item label="后缀">
            <el-select v-model="newFileExt" filterable allow-create default-first-option placeholder="选择或输入后缀">
              <el-option label="无后缀" value="" />
              <el-option v-for="ext in commonFileExts" :key="ext" :label="ext" :value="ext" />
            </el-select>
          </el-form-item>
          <el-form-item label="将创建">
            <span>{{ previewFileName }}</span>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="newFileVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmCreateFile">创建</el-button>
        </template>
      </el-dialog>

      <!-- 文件预览 -->
      <el-dialog v-model="viewerVisible" title="文件预览" width="60%">
        <el-input type="textarea" v-model="viewContent" readonly :rows="18" />
        <template #footer>
          <el-button @click="viewerVisible = false">关闭</el-button>
        </template>
      </el-dialog>

      <!-- 文件编辑 -->
      <el-dialog v-model="editorVisible" title="编辑文件" width="60%">
        <el-input type="textarea" v-model="editContent" :rows="18" />
        <template #footer>
          <el-button @click="editorVisible = false">取消</el-button>
          <el-button type="primary" @click="saveFile">保存</el-button>
        </template>
      </el-dialog>
    </el-main>
  </el-container>
  <MarkdownEditor v-else @back="currentView = 'explorer'" />
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toolbar-right {
  margin-left: auto;
}
:deep(.el-dropdown-menu__item.new-file-item) {
  color: #000000;
  background-color: #ffffff; /* warning */
}
:deep(.el-dropdown-menu__item.new-file-item:hover) {
  background-color: #b7dccb;
  color: #000000;
}
.context-menu {
  position: fixed;
  z-index: 2000;
  background: #ffffff;
  border: 1px solid #e4e7ed;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 6px 0;
  min-width: 160px;
  user-select: none;
  -webkit-user-select: none;
}
.menu-item {
  padding: 8px 14px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
}
.menu-item:hover {
  background-color: #f5f7fa;
}
.menu-item.danger {
  color: #f56c6c;
}
.menu-item.danger:hover {
  background-color: #fde2e2;
}

/* 鼠标悬停在任意行时显示手形指针（通过 :deep 作用于 Element Plus 渲染的行） */
.table-wrap :deep(.el-table__row) {
  cursor: pointer !important;
}

/* 行悬停时强调名称列 */
.table-wrap :deep(.el-table__body tr:hover td:first-child .cell) {
  font-weight: 600;
  color: var(--el-color-primary);
}

/* 禁止双击时选中文本（仅作用于表格主体） */
.table-wrap :deep(.el-table__body) {
  user-select: none;
  -webkit-user-select: none;
}
</style>
