'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('artisysLicense', Object.freeze({
  activate: (code) => ipcRenderer.invoke('license:activate', code),
}));