import fs from 'fs';
import path from 'path';
import endpointRoutingPackageManager from './package-manager.js';
import { ENDPOINT_TYPES_GROUP } from './constants.js';
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
function consoleLog(message) {
    if (debug === true) logPlatformRespectiveMessage(message);
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
    // Extract relevant argument values
    const configOutput = resolveAndValidatePath(
        args['configOutput'] || 'routes.json',
        { mustBeJson: true }
    );
    if (!doesFileExistSync(configOutput)) {
        initializeFileSync(configOutput);
    }
    const handlersDir = resolveAndValidatePath(
        args['handlersDir'] || 'endpoints',
        { mustExist: true, mustBeDir: true }
    );
    const pathBlacklist = args['pathBlacklist'] || null;
    debug = args['debug'] || false;

    consoleLog(`\n=====\nBegun Compiling Routes\n=====\n`);

    try {
        // Discover and compile all of the endpoint routes
        const nestedRoutes = {};
        const handlersDirPath = path.join(path.resolve(), handlersDir);
        consoleLog(`Searching for routes in '${handlersDirPath}' folder...`);
        await loadRoutes(nestedRoutes, handlersDirPath, pathBlacklist, '');

        // Retrieve the current version of the compilation algorithm
        const routeAlgVersion = Number(getNodePackageValue("route-alg-version"));

        // Amalgamate all values into a single dictionary
        const config = {
            version: routeAlgVersion,
            routes: nestedRoutes
        };
    
        // Write all values to a discoverable routes file
        consoleLog(`Writing routes to ${configOutput}...`);
        fs.writeFileSync(configOutput, JSON.stringify(config, null, 2));
        consoleLog(`Routes compiled successfully and saved to ${configOutput}!`);
    } catch (e) {
        // Throw the error to the console
        console.error(e);
    } finally {
        // Indicate the conclusion of the script, one way or another
        consoleLog(`\n=====\nConcluded Compiling Routes\n=====\n`);
    }
}

/**
 * Recursively traverse the provided endpoints directory.
 * 
 * @param {Object} nestedRoutes A dictionary valid routes will be written to.
 * @param {String} dir The current working directory.
 * @param {Array} pathBlacklist A list of directories to exclude from the final compile of routes.
 * @param {String} basePath The prefix for all routes.
 */
async function loadRoutes(nestedRoutes, dir, pathBlacklist, basePath) {
    if (!Array.isArray(pathBlacklist)) {
        pathBlacklist = [];
    }

    const files = fs.readdirSync(dir);
    const endpointTypesGroup = endpointRoutingPackageManager.get(ENDPOINT_TYPES_GROUP);
    const supportedEndpointTypes = Object.keys(endpointTypesGroup);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        // Directory
        if (stat.isDirectory()) {
            if (pathBlacklist.includes(file)) {
                consoleLog(`Skipping directory ${file} as defined within the path blacklist`);
                continue;
            }
            
            const currentPath = basePath + '/' + file;
            await loadRoutes(nestedRoutes, fullPath, pathBlacklist, currentPath, debug);
            continue;
        }

        // File
        let fileExtension = getFileExtension(file);
        if (!supportedEndpointTypes.includes(fileExtension)) {
            return;
        }
        try {
            consoleLog(`Found file ${fullPath}`);

            const routeModule = await import(`file://${fullPath}`);
            
            if (!routeModule.default || typeof routeModule.default !== 'object') {
                if (debug === true) console.warn(`Warning: No valid handlers found in ${toPlatformPath(fullPath)}`);
                continue;
            }
            
            // The current basePath represents the route for this index.js file
            const routePath = basePath || '/';
            for (const [method, handler] of Object.entries(routeModule.default)) {
                const relativeFilePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
                insertRoute(nestedRoutes, routePath, method, relativeFilePath, routePath === '/');
            }
            consoleLog(`Registered route: ${routePath}`);
        } catch (error) {
            consoleLog(`Error loading route from ${toPlatformPath(fullPath)}:`, error);
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
 * @param {Object} nestedRoutes A dictionary valid routes will be written to.
 * @param {String} fullPath The derived directory path.
 * @param {String} method The HTTP method the found function is for.
 * @param {String} filePath The project directory path to the endpoint file.
 */
function insertRoute(nestedRoutes, fullPath, method, filePath, root = false) {
    if (root) {
        // Handle root directory requests
        nestedRoutes['/'] = {};
        nestedRoutes['/'][method] = { filePath: filePath };
        return;
    }

    const segments = fullPath.split('/').filter(Boolean);
    let currentLevel = nestedRoutes;

    segments.forEach((segment, index) => {
        const formattedSegment = formatURLVariableSegment(segment);
        
        // If we’re at the last segment, insert the handler
        if (index === segments.length - 1) {
            if (!currentLevel[formattedSegment]) {
                currentLevel[formattedSegment] = {};
            }
            currentLevel[formattedSegment][method] = { filePath: filePath };
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
    urlVariableSegment
};