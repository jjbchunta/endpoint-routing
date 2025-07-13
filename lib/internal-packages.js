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

function extractDefaultExport(module) {
    if (module.default) {
        return module.default;
    }
    return module;
}

/*
    JS/MJS/CJS Files
*/
const jsHandlers = {
    insert: handleJSInsert,
    interpret: handleJSInterpret
}
endpointRoutingPackageManager.push('endpoint-types', 'js', jsHandlers);
endpointRoutingPackageManager.push('endpoint-types', 'mjs', jsHandlers);
endpointRoutingPackageManager.push('endpoint-types', 'cjs', jsHandlers);

/**
 * The handler behind the `insert` endpoint action for .js, .mjs, and .cjs file types.
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
    const module = await import(`file://${fullPath}`);
    const moduleExport = extractDefaultExport(module);

    if (!isJointFile) {
        // The file handle is an indication of the HTTP method that should be routed through it
        if (typeof moduleExport !== 'function') return;
        const method = formatHTTPMethod(fileHandle);
        insertRouteIntoRegistry(routeRegistry, routePath, method, nodeData);
    } else {
        // Endpoint files used to have all method type callbacks included in a single file
        // This catches that case an interprets it as it would originally for backwards compatability
        if (typeof moduleExport !== 'object') {
            logDebugMessage(`Warning: No valid handlers found in ${toPlatformPath(fullPath)}`);
            return;
        }
        // Insert an entry for every method present in the file
        for (const [method, handler] of Object.entries(moduleExport)) {
            if (typeof handler !== 'function') continue;
            insertRouteIntoRegistry(routeRegistry, routePath, method, nodeData);
        }
    }

    logDebugMessage(`Registered route: ${routePath}`);
}

/**
 * The handler behind the `interpret` endpoint action for .js, .mjs, and .cjs file types.
 */
async function handleJSInterpret(routeNode, req, res, next = null) {
    const file = routeNode.filePath;
    const jointFile = routeNode.hasOwnProperty('jointFile') ?
                        routeNode.jointFile === true :
                        getFileHandle(file) === 'index';
    
    let callback;
    const absolutePath = path.resolve(file);
    const fileURL = pathToFileURL(absolutePath).href;
    const module = await import(fileURL);
    const moduleExport = extractDefaultExport(module);
    if (jointFile !== true) {
        callback = moduleExport;
    } else {
        // Backwards compatability for index files
        const method = formatHTTPMethod(req.method);
        callback = moduleExport[method];
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