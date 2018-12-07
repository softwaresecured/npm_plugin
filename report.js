const Common    = require('./common.js');
const Vcs       = require('./vcs.js');
const Files     = require('./file.js');

const MD5       = require("md5")
const ESLint     = require("eslint");
const ESprima    = require('esprima');
const CLIEngine  = ESLint.CLIEngine;


const EslintMap = {
    "security/detect-unsafe-regex": "DDOS",
    "security/detect-buffer-noassert": "BUFFER_OVERFLOWS",
    "security/detect-disable-mustache-escape": "XSS",
    "security/detect-eval-with-expression": "CODE_EXECUTION",
    "security/detect-no-csrf-before-method-override":  "CSRF",
    "security/detect-non-literal-fs-filename": "UNAUTHORIZED_ACCESS_FILE_SYSTEM",
    "security/detect-non-literal-regexp": "DDOS",
    "security/detect-non-literal-require": "INSECURE_REQUIRE",
    "security/detect-object-injection": "INSECURE_OBJECT",
    "security/detect-possible-timing-attacks": "TIME_ATTACK",
    "security/detect-pseudoRandomBytes": "INSECURE_CRYPTO"
}


/**
 * report module take care of report
 * @module npm_plugin/report
 */
module.exports = {
     /**
     * execute npm audit on the target directory
     * @param  {string} root_path - root path directory
     * @return {string|null} - return audit result as a json if success, null otherwise
     */
    runAudit: function(root_path){
        var data = Common.systemSync('ls', root_path);
        if (data.includes('package.json')) {
            // if lock not in the package, we need to create one.
            if (! data.includes('package-lock.json')){
                console.log('INFO - Creating locks for dependency checker.');
                Common.systemSync('npm i --package-lock-only', root_path);
            }
            return Common.systemSync('npm audit --json', root_path);
        }
        else{
            console.log('INFO - Unable to locate base package information, are you sure package.json included?');
            return null;
        }
    },


     /**
     * iterate perform eslint on all the javascript in the list
     * @param  {string} root_json - The complete list of javascript files and their path as json
     * @return {json|null} - return raw eslint findings as a json if success, null otherwise
     */
    runEslint: function(root_json){
        if(!root_json){
            return null;
        }

        var cli = new CLIEngine({
            envs: ["node", "es6"],
            fix: false, // difference from last example
            useEslintrc: false,
            plugins: ["security"],
            rules:{
                "security/detect-unsafe-regex": 2,
                "security/detect-buffer-noassert": 2,
                "security/detect-disable-mustache-escape": 2,
                "security/detect-eval-with-expression": 2,
                "security/detect-no-csrf-before-method-override": 2,
                "security/detect-non-literal-fs-filename": 2,
                "security/detect-non-literal-regexp": 2,
                "security/detect-non-literal-require": 2,
                "security/detect-object-injection": 2,
                "security/detect-possible-timing-attacks": 2,
                "security/detect-pseudoRandomBytes": 2
            }
        });

        // clearly eslint don't know how to search folder although they claim they are
        target = []
        Object.keys(root_json).forEach(key => {
            root_json[key].forEach(file => {
                target.push(key + file);
            });
        });

        var report     = cli.executeOnFiles(target);
        var err_report = CLIEngine.getErrorResults(report.results);
        return err_report
    },


     /**
     * parse and assign blame to the current eslint report component
     * @param  {string} raw     - a raw string of git blame information
     * @param  {string} message - a message component from the eslint report
     * @param  {int}    start   - the starting line span
     * @param  {int}    end     - the ending line span
     * @return {null}
     */
    _assignBlame: function(raw, message, start, end){
        if(!raw){ message['blame'] = null; return;}
        var temp_store = [];

        raw_temp = raw.slice(start, end);
        raw_temp.forEach(blame => {
            temp_store.push(Vcs.genBlame(blame));
        });
        message['blame'] = temp_store;
    },

     /**
     * iterate the eslint raw report, generate blame and ast for it
     * @param  {json}   err_reports - collection of raw eslint reports
     * @param  {json}   blame_inf   - collections of raw blame information
     * @param  {string} root_path   - The root directory to perform the scan (default to current)
     * @param  {string} root_json   - The complete list of javascript files and their path as json
     * @return {json} - processed report with blame information and ast injected
     */
    prepareEslint: function(err_reports, blame_inf, root_path, git_hash){
        err_reports.forEach(report => {
            f_path    = report['filePath'];
            relative  = f_path.replace(root_path, '.');
            raw_blame = blame_inf[f_path] ? (blame_inf[f_path]).split('\n') : null;
            source    = report['source'].split('\n');

            try{ raw_ast = ESprima.parse(report['source'], {tolerant: true, loc: true});}
            catch(error){ raw_ast = null;}

            report['messages'].forEach(message =>{
                var start_line = message['line'] - 1;    //since line count starts at 0
                var end_line   = message['endLine'] === undefined ? message['line']: message['endLine'];
                var column     = message['column'] === undefined ? 0 : message['column'];
                var end_col    = message['endColumn'];

                if(EslintMap.hasOwnProperty(message['ruleId'])){
                    message['ruleId'] = EslintMap[message['ruleId']]
                }

                var instance_data = (start_line === end_line && end_line === 1) ? report['source'].slice(column, end_col).replace('\s', ''):
                                         source.slice(start_line, end_line).join('').replace('\s', '');
                message['instance hash'] = MD5(git_hash + relative + instance_data);

                this._assignBlame(raw_blame, message, start_line, end_line);
            });

            delete report['source'];

            report['ast']      = raw_ast;
        });
        return err_reports
    },


    /*
        STARTTIME   := newType('STARTTIME', str)
        description : function to create a bundle data
        requires    : data      -> JSON,
                    start     -> STARTTIME,
                    root_path -> str,
                    root_json -> JSON
        returns     : JSON
    */
     /**
     * generate scan report
     * @param  {json}   data      - raw audit report
     * @param  {string} start     - starting time of running
     * @param  {string} root_path - The root directory to perform the scan (default to current)
     * @param  {string} root_json - The complete list of javascript files and their path as json
     * @return {string} - return a complete report
     */
    createReport: function(data, start, root_path, root_json, is_git){
        // get host name, parse raw data
        var host_name = Common.systemSync('hostname')
        var raw_data  = JSON.parse(data);

        // get info related to git
        var git_hash  = null, proj_name = null, blame_inf = null, git_url = null;
        if (is_git){
            git_hash  = Vcs.getHash(root_path);
            proj_name = Vcs.getProject(root_path);
            blame_inf = Vcs.getBlame(root_path, root_json);
            git_url   = Vcs.getURL(root_path);
        }

        // get dependency related, assume package.json at root
        var packages  = Files.loadPackage(root_path + '/package.json');
        var dep_lists = Files.getDependencyList(packages);
        var blm_lists = Vcs.parseBlm(blame_inf, dep_lists);
        console.log("INFO - Execute security scanning.")
        var es_data   = this.prepareEslint(this.runEslint(root_json), blame_inf, root_path, git_hash);
        // always ok for now, we need exception handler
        var status    = 0;

        var bundle = {}, date_time = {}, project = {}, project_meta = {}, vcs_info = {};
        bundle['Date']          = date_time;
        date_time['Start']      = start;
        bundle['Machine Name']  = host_name;
        bundle['Project']       = project;
        project['Dependency Report'] = raw_data;
        project['Eslint Report']     = es_data;
        project['Project Meta']      = project_meta;
        project_meta['Project Name'] = proj_name;
        project_meta['Dependencies'] = dep_lists;
        project_meta['Absolute pth'] = root_path;
        project_meta['Exit Code'] = status;
        project_meta['VCS Info']     = vcs_info;
        project_meta['File Info']    = root_json;
        project_meta['Root']         = '.';
        vcs_info['Git Url']          = git_url;
        vcs_info['Git Hash']         = git_hash;
        vcs_info['blm_lists']        = blm_lists;

        return bundle;
    }
}