import endpointRoutingPackageManager from "./package-manager.js";
import { insertRouteIntoRegistry } from "./building-routes.js";
import path from 'path';
import { pathToFileURL } from 'url';
import {
    logPlatformRespectiveMessage,
    toPlatformPath,
    formatHTTPMethod,
    getFileExtension,
    getFileHandle
} from "./utilities.js";

/**
 * Alter whether we should be logging the compiling process to the console. By default, this is set to false.
 */
let internalDebugNote = false;

/**
 * Log a message to the console, but only if `debug` is set to true.
 * 
 * @param {String} message The message we wish to log.
 */
function logDebugMessage(message) {
    if (internalDebugNote === true) logPlatformRespectiveMessage(message);
}

/*
    JS Files
*/
async function handleJSInsert(fullPath, relativePath, routePath, routeRegistry, debug = false) {
    internalDebugNote = debug;

    let fileHandle = getFileHandle(fullPath);
    const isJointFile = fileHandle === 'index';
    const nodeData = {
        filePath: relativePath,
        type: getFileExtension(relativePath),
        jointFile: isJointFile
    };

    if (!isJointFile) {
        // The file handle is an indication of the HTTP method that should be routed through it
        const method = formatHTTPMethod(fileHandle);
        insertRouteIntoRegistry(routeRegistry, routePath, method, nodeData);
    } else {
        // Endpoint files used to have all method type callbacks included in a single file
        // This catches that case an interprets it as it would originally for backwards compatability
        const routeModule = await import(`file://${fullPath}`);
        
        if (!routeModule.default || typeof routeModule.default !== 'object') {
            logDebugMessage(`Warning: No valid handlers found in ${toPlatformPath(fullPath)}`);
            return;
        }
        // Insert an entry for every method present in the file
        for (const [method, handler] of Object.entries(routeModule.default)) {
            insertRouteIntoRegistry(routeRegistry, routePath, method, nodeData);
        }
    }

    logDebugMessage(`Registered route: ${routePath}`);
}
async function handleJSInterpret(routeNode, req, res, next = null) {
    const file = routeNode.filePath;
    const jointFile = routeNode.hasOwnProperty('jointFile') ?
                        routeNode.jointFile === true :
                        getFileHandle(file) === 'index';
    
    let callback;
    const absolutePath = path.resolve(file);
    const fileURL = pathToFileURL(absolutePath).href;
    const module = await import(fileURL);
    if (jointFile !== true) {
        callback = module.default;
    } else {
        // Backwards compatability for index files
        const method = formatHTTPMethod(req.method);
        callback = module.default[method];
    }

    if (typeof callback !== 'function') {
        console.error(`callback for ${req.method} ${requestPath} is not a function.`);
        throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
    }
    if (typeof next === 'function' && callback.length >= 3) {
        return await callback(req, res, next);
    } else {
        return await callback(req, res);
    }
}
endpointRoutingPackageManager.push(
    'endpoint-types',
    'js',
    {
        insert: handleJSInsert,
        interpret: handleJSInterpret
    }
);
