import fs from 'fs';
import path from 'path';
import endpointRoutingPackageManager from './package-manager.js';
import {
    extractArg,
    logPlatformRespectiveMessage,
    toPlatformPath,
    getNodePackageValue,
    doesFileExistSync,
    initializeFileSync,
    getFileExtension,
    getFileHandle
} from './utilities.js';

/*
    █▄▄ █░█ █ █░░ █▀▄ █ █▄░█ █▀▀   █▀█ █▀█ █░█ ▀█▀ █▀▀ █▀
    █▄█ █▄█ █ █▄▄ █▄▀ █ █░▀█ █▄█   █▀▄ █▄█ █▄█ ░█░ ██▄ ▄█
*/

/**
 * The character string prefix inside the compiled route JSON file indicating that a path segment utilizes URL variables.
 */
const urlVariableSegment = "/:";

/**
 * Alter whether we should be logging the compiling process to the console. By default, this is set to false.
 */
let debug = false;

/**
 * The endpoint file handle names that we're specifically looking for.
 */
const supportedEndpointFileHandles = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'index' // legacy
];

/**
 * Log a message to the console, but only if `debug` is set to true.
 * 
 * @param {String} message The message we wish to log.
 */
function logDebugMessage(message) {
    if (debug === true) logPlatformRespectiveMessage(message);
}

/**
 * Compile the current endpoint routes to a reachable JSON file.
 * 
 * @param {Object} args A list of parameters to configure how the endpoint routing is compiled. The supported arguments are as follows:
 * 
 * * **output** `String` - The name of the file where the compiled routes should be written to. By default, this is set to `"routes.json"`.
 * * **endpoints** `String` - The parent folder we're compiling these endpoints from. By default, this is set to `"endpoints"`.
 * * **pathBlacklist** `Array|null` - The path(s) to exclude from the compiled output. For example, blacklisting 'dev' will omit a path like: "/dev/generate-api-key". By default, this is set to `null`.
 * * **debug** `Boolean` - Whether status updates on the progress of the route compiling should be logged. By default, this is set to `false`.
 * * **returnRegistry** `Boolean` - When true, the JSON that would otherwise be written to the `output` file is returned by the function instead. By default, this is set to `false`.
 * 
 * @throws {Error} If the included `configOutput` is not a valid path and point to a JSON file, an exception will be thrown.
 * @throws {Error} If the included `handlersDir` is not a valid path and point to a directory, an exception will be thrown.
 */
async function buildEndpointRoutes(args = {}) {
    // Amalagamate
    const outputFile = extractArg(args, ['output', 'configOutput'], 'routes.json', { mustBeJson: true });
    if (!doesFileExistSync(outputFile)) initializeFileSync(outputFile);

    const relativeEndpointDir = extractArg(args, ['endpoints', 'handlersDir'], 'endpoints', { mustExist: true, mustBeDir: true });
    const endpointDir = path.join(path.resolve(), relativeEndpointDir);

    const pathBlacklist = extractArg(args, 'pathBlacklist', null);
    debug = extractArg(args, 'debug', false);
    const returnRegistry = extractArg(args, 'returnRegistry', false);
    const routeAlgVersion = getCurrentRouteCompileVersion();
    const routeRegistry = {};

    // Construct
    logDebugMessage(`\n=====\nBegun Compiling Routes\n=====\n`);
    try {
        logDebugMessage(`Searching for routes in '${endpointDir}' folder...`);
        await loadDirFilesRecursively(routeRegistry, endpointDir, pathBlacklist, '');
        const compilation = {
            version: routeAlgVersion,
            relativeDir: relativeEndpointDir,
            dir: endpointDir,
            blacklist: pathBlacklist,
            routes: routeRegistry
        };
        
        if (returnRegistry === true) {
            return compilation;
        } else {
            logDebugMessage(`Writing routes to ${outputFile}...`);
            fs.writeFileSync(outputFile, JSON.stringify(compilation, null, 2));
            logDebugMessage(`Routes compiled successfully and saved to ${outputFile}!`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        logDebugMessage(`\n=====\nConcluded Compiling Routes\n=====\n`);
    }
}

/**
 * @returns {Number} The current numerical version of the route compiling algorithm code.
 */
function getCurrentRouteCompileVersion() {
    return Number(getNodePackageValue("route-alg-version"));
}

/**
 * Recursively traverse the provided endpoints directory.
 * 
 * @param {Object} routeRegistry A dictionary valid routes will be written to.
 * @param {String} dir The current working directory.
 * @param {Array} pathBlacklist A list of directories to exclude from the final compile of routes.
 * @param {String} basePath The prefix for all routes.
 */
async function loadDirFilesRecursively(routeRegistry, dir, pathBlacklist, basePath) {
    if (!Array.isArray(pathBlacklist)) {
        pathBlacklist = [];
    }

    const files = fs.readdirSync(dir);
    const endpointTypes = endpointRoutingPackageManager.get('endpoint-types');
    const supportedEndpointFileTypes = Object.keys(endpointTypes);
    const routePath = basePath || '/';

    for (let file of files) {
        const fullPath = path.join(dir, file);
        const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        const platformRespectiveFullPath = toPlatformPath(fullPath);
        const stat = fs.statSync(fullPath);
        
        // Directory
        if (stat.isDirectory()) {
            if (pathBlacklist.includes(file)) {
                logDebugMessage(`Skipping directory ${file} as defined within the path blacklist`);
                continue;
            }
            
            const currentPath = basePath + '/' + file;
            await loadDirFilesRecursively(routeRegistry, fullPath, pathBlacklist, currentPath, debug);
            continue;
        }

        // File
        let fileExtension = getFileExtension(file);
        let fileHandle = getFileHandle(file);
        if (!supportedEndpointFileTypes.includes(fileExtension)) continue;
        if (!supportedEndpointFileHandles.includes(fileHandle)) continue;

        try {
            logDebugMessage(`Found file ${fullPath}`);
            if (!endpointTypes[fileExtension].hasOwnProperty('insert')) continue;
            let insertCallback = endpointTypes[fileExtension]['insert'];
            if (typeof insertCallback !== 'function') continue;
            await insertCallback(fullPath, relativePath, routePath, routeRegistry, debug);
        } catch (error) {
            logDebugMessage(`Error loading route from ${platformRespectiveFullPath}:`, error.message);
        }
    }
};

/**
 * Convert a directory name like "[customerID]" to an Express-style dynamic segment (ex: "/:customerID")
 * 
 * @param {String} segment The directory path segement.
 * @returns {String} The URL Express-style version of the provided directory.
 */
function formatURLVariableSegment(segment) {
    if (segment.startsWith('[') && segment.endsWith(']')) {
        return urlVariableSegment + segment.replace(/^\[(.+)\]$/, '$1');
    } else {
        return '/' + segment;
    }
}

/**
 * Insert a route into the nested routes object.
 * 
 * @param {Object} routeRegistry A dictionary valid routes will be written to.
 * @param {String} fullPath The derived directory path.
 * @param {String} method The HTTP method the found function is for.
 * @param {Object} nodeData The data to insert at the registry location for this endpoint.
 */
function insertRouteIntoRegistry(routeRegistry, fullPath, method, nodeData) {
    if (fullPath === '/') {
        // Handle root directory requests
        routeRegistry['/'] = {};
        routeRegistry['/'][method] = nodeData;
        return;
    }

    const segments = fullPath.split('/').filter(Boolean);
    let currentLevel = routeRegistry;

    segments.forEach((segment, index) => {
        const formattedSegment = formatURLVariableSegment(segment);
        
        // If we’re at the last segment, insert the handler
        if (index === segments.length - 1) {
            if (!currentLevel[formattedSegment]) {
                currentLevel[formattedSegment] = {};
            }
            currentLevel[formattedSegment][method] = nodeData;
        } else {
            if (!currentLevel[formattedSegment]) {
                currentLevel[formattedSegment] = {};
            }
            currentLevel = currentLevel[formattedSegment];
        }
    });
};


export default buildEndpointRoutes;
export {
    insertRouteIntoRegistry,
    getCurrentRouteCompileVersion,
    urlVariableSegment
};