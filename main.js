#!/usr/bin/env node
'use strict';

const config = require('./config.js');
const git = require('./git.js');
const scanService = require('./scan-service.js');
const util = require('util');
const prettyMilliseconds = require('pretty-ms');
const { exit } = require('process');

async function runScan(configuration) {
    if (!configuration.isValid()) {
        console.error('Invalid configuration used for the reshift-plugin-npm')
        exit(1);
    }

    const no_git_error = 'ERROR: Unable to retrieve Git project information. Either git is not installed or project is not a git directory.';
    // lets get the git information for this project folder
    const gitInstance = new git.Git(configuration.projectDir);
    const repoInfo = await gitInstance.getRepositoryInfo();
    if (!repoInfo) {
        console.error(no_git_error);
        exit(1);
    }
    const meta = await gitInstance.branchInfo();
    if (!meta) {
        console.error(no_git_error);
        exit(1);
    }
    meta.commitHash = await gitInstance.commitHash();
    var gitStatus = await gitInstance.getGitStatus();
    var branch = gitStatus ? gitStatus.tracking : null;
    if (!gitStatus) {
        console.error(no_git_error);
        exit(1);
    }
    if (!branch) {
       branch = meta.local
       console.warn('WARN: Unable to get project git state. Project is either in a detached state or out of sync with remote.');
    }
    if (!gitStatus.isClean()) {
        console.warn('WARN: Git project seems to have local changes or is not clean. Local changes will not be scanned.');
    }
    if (gitStatus.ahead > 0) {
        console.error('ERROR: Git project seems to be ahead of remote. Make sure local copy is in sync with remote.');
        exit(1);
    }
    var projectProviderUrl = repoInfo.href;
    
    var start = new Date();
    console.log(util.format('RESHIFT SECURITY: Starting scan for project %s', repoInfo.full_name));
    const scannerService = new scanService.ScanService(configuration.endpoint, configuration.timeoutSeconds, configuration.language);
    const scanSuccess = await scannerService.executeScan(
        configuration.token,
        projectProviderUrl,
        branch,
        meta.commitHash
    );
    var scanTimeMs = new Date() - start;
    console.log(util.format("Finished in %s", prettyMilliseconds(scanTimeMs)));
    exit(scanSuccess ? 0 : 1);
}

(async () => {
    if (typeof require !== 'undefined' && require.main == module) {
        const configuration = new config.Config();
        await runScan(configuration);
    }
})()
