import fs from 'fs';
import path from 'path';
import { resolveAndValidatePath } from './utilities.js';

/*
    █▄▄ █░█ █ █░░ █▀▄ █ █▄░█ █▀▀   █▀█ █▀█ █░█ ▀█▀ █▀▀ █▀
    █▄█ █▄█ █ █▄▄ █▄▀ █ █░▀█ █▄█   █▀▄ █▄█ █▄█ ░█░ ██▄ ▄█
*/

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
const buildEndpointRoutes = async (args) => {
    // Extract relevant argument values
    const configOutput = resolveAndValidatePath(
        args['configOutput'] || 'routes.json',
        { mustExist: true, mustBeJson: true }
    );
    const handlersDir = resolveAndValidatePath(
        args['handlersDir'] || 'endpoints',
        { mustExist: true, mustBeDir: true }
    );
    const pathBlacklist = args['pathBlacklist'] || null;
    const debug = args['debug'] || false;

    if (debug === true) console.log(`\n=====\nBegun Compiling Routes\n=====\n`);

    try {
        // Discover and compile all of the endpoint routes
        const nestedRoutes = {};
        const handlersDirPath = path.join(path.resolve(), handlersDir);
        if (debug === true) console.log(`Searching for routes in '${handlersDirPath}' folder...`);
        await loadRoutes(nestedRoutes, handlersDirPath, pathBlacklist, '', debug);
    
        // Write them all to a discoverable routes file
        if (debug === true) console.log(`Writing routes to ${configOutput}...`);
        fs.writeFileSync(configOutput, JSON.stringify(nestedRoutes, null, 2));
        if (debug === true) console.log(`Routes compiled successfully and saved to ${configOutput}!`);
    } catch (e) {
        // Throw the error to the console
        console.error(e);
    } finally {
        // Indicate the conclusion of the script, one way or another
        if (debug === true) console.log(`\n=====\nConcluded Compiling Routes\n=====\n`);
    }
}

/**
 * Recursively traverse the provided endpoints directory.
 * 
 * @param {Object} nestedRoutes A dictionary valid routes will be written to.
 * @param {String} dir The current working directory.
 * @param {Array} pathBlacklist A list of directories to exclude from the final compile of routes.
 * @param {String} basePath The prefix for all routes.
 * @param {Boolean} debug Whether status updates on the progress of the route compiling should be logged.
 */
async function loadRoutes(nestedRoutes, dir, pathBlacklist, basePath, debug) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            // Skip any endpoint paths mentioned within the path blacklist
            if (Array.isArray(pathBlacklist) && pathBlacklist.includes(file)) {
                if (debug === true) console.log(`Skipping directory ${file} as defined within the path blacklist`);
                continue;
            }
            
            // ... otherwise, continue to traverse the path
            const currentPath = basePath + '/' + file;
            await loadRoutes(nestedRoutes, fullPath, pathBlacklist, currentPath, debug);
        } else if (file === 'index.js') {
            try {
                if (debug === true) console.log(`Found file ${fullPath}`);

                // Dynamically import the module to verify it exports a valid object
                const routeModule = await import(`file://${fullPath}`);
                
                if (!routeModule.default || typeof routeModule.default !== 'object') {
                    if (debug === true) console.warn(`Warning: No valid handlers found in ${fullPath}`);
                    continue;
                }
                
                // The current basePath represents the route for this index.js file
                const routePath = basePath;
                // For each HTTP method defined in the module, store the file path
                for (const [method, handler] of Object.entries(routeModule.default)) {
                    // We are not stringifying the function. Instead, we store its file path
                    const relativeFilePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
                    insertRoute(nestedRoutes, routePath, method, relativeFilePath);
                }
                if (debug === true) console.log(`Registered route: ${routePath}`);
            } catch (error) {
                if (debug === true) console.error(`Error loading route from ${fullPath}:`, error);
            }
        }
    }
};

/**
 * Convert a directory name like "[customerID]" to an Express-style dynamic segment (ex: "/:customerID")
 * 
 * @param {String} segment The directory path segement.
 * @returns {String} The URL Express-style version of the provided directory.
 */
const formatSegment = (segment) => '/' + segment.replace(/^\[(.+)\]$/, ':$1');

/**
 * Insert a route into the nested routes object.
 * 
 * @param {Object} nestedRoutes A dictionary valid routes will be written to.
 * @param {String} fullPath The derived directory path.
 * @param {String} method The HTTP method the found function is for.
 * @param {String} filePath The project directory path to the endpoint file.
 */
const insertRoute = (nestedRoutes, fullPath, method, filePath) => {
    // Split the fullPath into segments and filter out empty ones
    const segments = fullPath.split('/').filter(Boolean);
    let currentLevel = nestedRoutes;

    segments.forEach((segment, index) => {
        // Convert dynamic segments (ex: "[customerID]") to Express style
        const formattedSegment = (segment.startsWith('[') && segment.endsWith(']'))
            ? formatSegment(segment)
            : '/' + segment;
        
        // If we’re at the last segment, insert the handler
        if (index === segments.length - 1) {
            if (!currentLevel[formattedSegment]) {
                currentLevel[formattedSegment] = {};
            }
            // Instead of a function string, store the absolute file path
            currentLevel[formattedSegment][method] = { filePath: filePath };
        } else {
            // Otherwise, create or traverse into the next level
            if (!currentLevel[formattedSegment]) {
                currentLevel[formattedSegment] = {};
            }
            currentLevel = currentLevel[formattedSegment];
        }
    });
};


export default buildEndpointRoutes;