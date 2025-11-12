import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  fs: {
    listDir: (dirPath) => ipcRenderer.invoke('fs:list', dirPath),
    createDir: (parentPath, name) => ipcRenderer.invoke('fs:mkdir', parentPath, name),
    delete: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
    rename: (targetPath, newName) => ipcRenderer.invoke('fs:rename', targetPath, newName),
    getBase: () => ipcRenderer.invoke('fs:getBase'),
    createFile: (parentPath, name, content = '') => ipcRenderer.invoke('fs:createFile', parentPath, name, content),
    readFile: (targetPath) => ipcRenderer.invoke('fs:readFile', targetPath),
    writeFile: (targetPath, content) => ipcRenderer.invoke('fs:writeFile', targetPath, content),
    openExternal: (targetPath) => ipcRenderer.invoke('fs:openExternal', targetPath),
    revealInFolder: (targetPath) => ipcRenderer.invoke('fs:revealInFolder', targetPath)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
