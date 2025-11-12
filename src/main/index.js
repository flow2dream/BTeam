import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
let managedBaseDir = ''

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Initialize managed base folder under user's Documents
  try {
    const baseName = 'BTeam'
    const docs = app.getPath('documents')
    managedBaseDir = path.join(docs, baseName)
    if (!fsSync.existsSync(managedBaseDir)) {
      fsSync.mkdirSync(managedBaseDir, { recursive: true })
    }
  } catch (e) {
    // Fallback to userData if documents isn't available
    const fallback = path.join(app.getPath('userData'), 'BTeamFolder')
    managedBaseDir = fallback
    if (!fsSync.existsSync(managedBaseDir)) {
      fsSync.mkdirSync(managedBaseDir, { recursive: true })
    }
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// ---------- Filesystem IPC Handlers ----------

function isInsideBase(p) {
  try {
    const rel = path.relative(managedBaseDir, p)
    // allow base itself ('') and any sub-paths
    return !rel.startsWith('..') && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

// Get the managed base directory
ipcMain.handle('fs:getBase', async () => {
  return managedBaseDir
})

// Compute directory size recursively (sum of all files under it)
async function computeDirSize(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const sizes = await Promise.all(
      entries.map(async (dirent) => {
        const full = path.join(dirPath, dirent.name)
        try {
          const st = await fs.stat(full)
          if (st.isDirectory()) {
            return await computeDirSize(full)
          }
          return st.size || 0
        } catch {
          return 0
        }
      })
    )
    return sizes.reduce((a, b) => a + b, 0)
  } catch {
    return 0
  }
}

// List directory contents
ipcMain.handle('fs:list', async (_event, dirPath) => {
  try {
    const target = dirPath && dirPath.length > 0 ? dirPath : managedBaseDir
    if (!isInsideBase(target)) {
      throw new Error('Path outside managed folder')
    }
    const entries = await fs.readdir(target, { withFileTypes: true })
    const items = await Promise.all(
      entries.map(async (dirent) => {
        const fullPath = path.join(target, dirent.name)
        let size = 0
        let mtime = 0
        try {
          const stats = await fs.stat(fullPath)
          if (stats.isDirectory()) {
            size = await computeDirSize(fullPath)
          } else {
            size = stats.size
          }
          mtime = stats.mtimeMs
        } catch {
          // ignore stat error
        }
        return {
          name: dirent.name,
          path: fullPath,
          isDirectory: dirent.isDirectory(),
          size,
          mtime
        }
      })
    )
    return { path: target, items }
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to list directory')
  }
})

// Create a new directory under parentPath with provided name
ipcMain.handle('fs:mkdir', async (_event, parentPath, name) => {
  try {
    if (!parentPath || !name) throw new Error('Invalid parameters')
    if (!isInsideBase(parentPath)) throw new Error('Unauthorized path')
    const newPath = path.join(parentPath, name)
    await fs.mkdir(newPath)
    return true
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to create directory')
  }
})

// Delete a file or directory (recursive for directory)
ipcMain.handle('fs:delete', async (_event, targetPath) => {
  try {
    if (!targetPath) throw new Error('Invalid target path')
    if (!isInsideBase(targetPath)) throw new Error('Unauthorized path')
    const stat = await fs.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true })
    } else {
      await fs.unlink(targetPath)
    }
    return true
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to delete entry')
  }
})

// Rename a file or directory
ipcMain.handle('fs:rename', async (_event, targetPath, newName) => {
  try {
    if (!targetPath || !newName) throw new Error('Invalid parameters')
    if (!isInsideBase(targetPath)) throw new Error('Unauthorized path')
    const dir = path.dirname(targetPath)
    const newPath = path.join(dir, newName)
    await fs.rename(targetPath, newPath)
    return newPath
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to rename entry')
  }
})

// ---------- File operations ----------

// Create a new file with optional initial content
ipcMain.handle('fs:createFile', async (_event, parentPath, name, content = '') => {
  try {
    if (!parentPath || !name) throw new Error('Invalid parameters')
    if (!isInsideBase(parentPath)) throw new Error('Unauthorized path')
    const filePath = path.join(parentPath, name)
    await fs.writeFile(filePath, content ?? '', { encoding: 'utf-8' })
    return true
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to create file')
  }
})

// Read a text file
ipcMain.handle('fs:readFile', async (_event, targetPath) => {
  try {
    if (!targetPath) throw new Error('Invalid target path')
    if (!isInsideBase(targetPath)) throw new Error('Unauthorized path')
    const content = await fs.readFile(targetPath, { encoding: 'utf-8' })
    return content
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to read file')
  }
})

// Write a text file
ipcMain.handle('fs:writeFile', async (_event, targetPath, content) => {
  try {
    if (!targetPath) throw new Error('Invalid target path')
    if (!isInsideBase(targetPath)) throw new Error('Unauthorized path')
    await fs.writeFile(targetPath, content ?? '', { encoding: 'utf-8' })
    return true
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to write file')
  }
})

// Open file with system default application
ipcMain.handle('fs:openExternal', async (_event, targetPath) => {
  try {
    if (!targetPath) throw new Error('Invalid target path')
    if (!isInsideBase(targetPath)) throw new Error('Unauthorized path')
    const res = await shell.openPath(targetPath)
    if (res) {
      // shell.openPath returns an error string on failure, empty string on success
      throw new Error(res)
    }
    return true
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to open externally')
  }
})

// Reveal item (file or folder) in system file explorer
ipcMain.handle('fs:revealInFolder', async (_event, targetPath) => {
  try {
    if (!targetPath) throw new Error('Invalid target path')
    if (!isInsideBase(targetPath)) throw new Error('Unauthorized path')
    // If it's a directory, open the folder; if it's a file, reveal it in its folder
    try {
      const stat = await fs.stat(targetPath)
      if (stat.isDirectory()) {
        const res = await shell.openPath(targetPath)
        if (res) throw new Error(res)
        return true
      } else {
        shell.showItemInFolder(targetPath)
        return true
      }
    } catch (e) {
      // Fallback: try opening path if stat fails
      const res = await shell.openPath(targetPath)
      if (res) throw new Error(res)
      return true
    }
  } catch (err) {
    return Promise.reject(err?.message || 'Failed to reveal in folder')
  }
})
