'use strict';

const assert = require('assert');
const util = require('util');
/**
 * commit hash: git rev-parse HEAD
 * current branch: git branch -vv
 */
class Git{
    constructor(projectRoot){
        this.simpleGit = require('simple-git')(projectRoot);
    }

    async branchInfo(){
        const branchPromise = new Promise(function(resolve, reject){
            this.simpleGit.branch({'-vv': null}, function(err, summary){
                if( err ){ reject(err); } 
                else { resolve(summary); }
            });
        }.bind(this))
        .catch(error => {
            console.error(util.format("Unable to get git branch info: %s", error.message));
        });
        const branchResult = await branchPromise;
        let info = {};
        if (branchResult && branchResult.current in branchResult.branches){
            const matches = branchResult.branches[branchResult.current].label.match(/\[(.*)\]/);
            if( matches && matches.length >= 2 ){
                info['remotes'] = matches[1];
            }
            info['local'] = branchResult.branches[branchResult.current].name;
        }
        return info;
    }

    async commitHash(){
        const revParse = new Promise(function(resolve, reject){
            this.simpleGit.revparse(['HEAD'], function(err, summary){
                if( err ){ reject(err); } 
                else { resolve(summary); }
            });
        }.bind(this))
        .catch(error => {
            console.error(util.format("Unable to get git commit info: %s", error.message));
        });

        return await revParse;
    }

    async getRepositoryInfo() {
        const uriParse = new Promise(function(resolve, reject){
            this.simpleGit.listRemote(['--get-url'], function(err, data){
                if( err ){ reject(err); } 
                else {
                    resolve(require("git-url-parse")(data.toString().replace('\n','')));
                }
            });
        }.bind(this))
        .catch(error => {
            console.error(util.format("Unable to get git repository info: %s", error.message));
        });

        return await uriParse;
    }

    async getGitStatus() {
        const gitStatus = new Promise(function(resolve, reject){
            this.simpleGit.status([], function(err, data){
                if( err ){ reject(err); } 
                else {
                    resolve(data);
                }
            });
        }.bind(this))
        .catch(error => {
            console.error(util.format("Unable to get git status info: %s", error.message));
        });

        return await gitStatus;
    }
}

module.exports = {
    Git : Git
}