'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('dhpDesktop', {
  publishingWorker: {
    health: () => invoke('publishing-worker:health'),
    saveAccount: (platform, credentials) => invoke('publishing-worker:save-account', platform, credentials),
    verifyAccount: (platform) => invoke('publishing-worker:verify-account', platform),
    removeAccount: (platform) => invoke('publishing-worker:remove-account', platform),
    createJob: (job) => invoke('publishing-worker:create-job', job),
    listJobs: () => invoke('publishing-worker:list-jobs'),
    processJobs: () => invoke('publishing-worker:process-jobs'),
    retryJob: (jobId) => invoke('publishing-worker:retry-job', jobId),
  },
});
