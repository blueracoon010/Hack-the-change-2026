// Safe bridge between Electron and the web page. Expose ONLY what the UI needs.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
})
