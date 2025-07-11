import fs from 'fs';
import path from 'path';
import endpointRoutingPackageManager from './package-manager.js';
import {
    resolveAndValidatePath,
    logPlatformRespectiveMessage,
    toPlatformPath,
    getNodePackageValue,
    doesFileExistSync,
    initializeFileSync,
    getFileExtension
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
 * Log a message to the console, but only if `debug` is set to true.
 * 
 * @param {String} message The message we wish to log.
 */
function logDebugMessage(message) {
    if (debug === true) logPlatformRespectiveMessage(message);
}

/**
 * Safely search an array for an argument.
 * 
 * @param {Object} args The dictionary we're searching through.
 * @param {String|Array} possibleKeys The one or several keys to look for that represent this value.
 * @param {*} fallback The value that will be fallen back onto if a key exists, but a falsy value lives as the value.
 * @param {Object} pathArgs If relevant, the `options` value for a `resolveAndValidatePath` call.
 * @returns {*|null} The argument value on success, null if the key doesn't exist.
 */
function extractArg(args, possibleKeys, fallback = null, pathArgs = null) {
    let validKey = null;
    if (typeof possibleKeys === 'string') {
        if (!args.hasOwnProperty(possibleKeys)) return null;
        validKey = possibleKeys;
    } else {
        possibleKeys.forEach(possibleKey => {
            if (args.hasOwnProperty(possibleKey)) {
                validKey = possibleKey;
            }
        });
    }
    if (!validKey) return null;

    let value = args[validKey] || fallback;
    if (pathArgs) {
        value = resolveAndValidatePath(value, pathArgs);
    }
    return value;
}

/**
 * Compile the current endpoint routes to a reachable JSON file.
 * 
 * @param {Object} args A list of parameters to configure how the endpoint routing is compiled. The supported arguments are as follows:
 * 
 * * **configOutput** `String` - The name of the file where the compiled routes should be written to. By default, this is set to `"routes.json"`.
 * * **handlersDir** `String` - The parent folder we're compiling these endpoints from. By default, this is set to `"endpoints"`.
 * * **pathBlacklist** `Array|null` - The path(s) to exclude from the compiled output. For example, blacklisting 'dev' will omit a path like: "/dev/generate-api-key". By default, this is set to `null`.
 * * **debug** `Boolean` - Whether status updates on the progress of the route compiling should be logged. By default, this is set to `false`.
 * 
 * @throws {Error} If the included `configOutput` is not a valid path and point to a JSON file, an exception will be thrown.
 * @throws {Error} If the included `handlersDir` is not a valid path and point to a directory, an exception will be thrown.
 */
async function buildEndpointRoutes(args) {
    // Amalagamate
    const outputFile = extractArg(args, ['output', 'configOutput'], 'routes.json', { mustBeJson: true });
    if (!doesFileExistSync(outputFile)) initializeFileSync(outputFile);

    const relativeEndpointDir = extractArg(args, ['endpoints', 'handlersDir'], 'endpoints', { mustExist: true, mustBeDir: true });
    const endpointDir = path.join(path.resolve(), relativeEndpointDir);

    const pathBlacklist = extractArg(args, 'pathBlacklist', null);
    debug = extractArg(args, 'debug', false);
    const routeAlgVersion = Number(getNodePackageValue("route-alg-version"));
    const routeRegistry = {};

    // Construct
    logDebugMessage(`\n=====\nBegun Compiling Routes\n=====\n`);
    try {
        logDebugMessage(`Searching for routes in '${endpointDir}' folder...`);
        await loadDirFilesRecursively(routeRegistry, endpointDir, pathBlacklist, '');
        const compilation = {
            version: routeAlgVersion,
            routes: routeRegistry
        };
        logDebugMessage(`Writing routes to ${outputFile}...`);
        fs.writeFileSync(outputFile, JSON.stringify(compilation, null, 2));
        logDebugMessage(`Routes compiled successfully and saved to ${outputFile}!`);
    } catch (e) {
        console.error(e);
    } finally {
        logDebugMessage(`\n=====\nConcluded Compiling Routes\n=====\n`);
    }
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

    for (const file of files) {
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
        if (!supportedEndpointFileTypes.includes(fileExtension)) {
            return;
        }
        try {
            logDebugMessage(`Found file ${fullPath}`);
            if (!endpointTypes[fileExtension].hasOwnProperty('insert')) continue;
            let insertCallback = endpointTypes[fileExtension]['insert'];
            if (typeof insertCallback !== 'function') continue;
            await insertCallback(fullPath, relativePath, routePath, routeRegistry, debug);
        } catch (error) {
            logDebugMessage(`Error loading route from ${platformRespectiveFullPath}:`, error);
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
    urlVariableSegment
};