import fs from 'fs';
import path from 'path';

/*
    █▀▄▀█ ▄▀█ █▄▀ █ █▄░█ █▀▀   █▀█ █▀▀ █▀█ █░█ █▀▀ █▀ ▀█▀ █▀
    █░▀░█ █▀█ █░█ █ █░▀█ █▄█   █▀▄ ██▄ ▀▀█ █▄█ ██▄ ▄█ ░█░ ▄█
*/

/**
 * Initalize an instance of the `EndpointRouting` class.
 * 
 * @param {Object} args A list of parameters to configure how the endpoint routing is initialized. The supported arguments are as follows:
 * 
 * * **routesConfig** `String` - The name of the file where the compiled routes should be retrieved from. By default, this is set to `"routes.json"`.
 * * **handlersDir** `String` - The parent folder we're compiling these endpoints from. By default, this is set to `"endpoints"`.
 * * **allowedMethods** `Array` - A whitelist for permitted HTTP request methods. By default, all methods are allowed.
 * 
 * @returns {EndpointRouting} A usable instance of the `EndpointRouting` class.
 */
function endpointRouting(args) {
    // Extract relevant arguments and autofill missing pieces
    const routesConfig = args['routesConfig'] || 'routes.json';
    const handlersDir = args['handlersDir'] || 'endpoints';
    const allowedMethods = args['allowedMethods'] || null;

    // Ensure there is a routes JSON file to read endpoints from
    const routeRegistry = JSON.parse(fs.readFileSync(`./${routesConfig}`, 'utf8'));

    // Initialize a new endpoing routing class
    return new EndpointRouting(handlersDir, routeRegistry, allowedMethods);
}

/**
 * A handler class to assist with preforming HTTP requests to specific endpoints with specific methods.
 */
class EndpointRouting {
    #handlersDir;
    #routeRegistry;
    #allowedMethods;

    constructor(handlersDir, routeRegistry, allowedMethods) {
        this.#handlersDir = handlersDir;
        this.#routeRegistry = routeRegistry;
        this.#allowedMethods = allowedMethods;
    }

    /**
     * Check to see if an endpoint at a specific path and method exists.
     * 
     * @param {String} path The request path.
     * @param {String} method The HTTP method.
     * @returns {Boolean} A boolean indication of the path existance.
     */
    async doesEndpointExist(path, method) {
        // Sanitize incoming data
        method = formatHTTPMethod(method);

        // Simply check if we're able to successfully retrieve a handler at a specific endpoint + method
        try {
            const handler = await this.#retrieveHandlerFromURLPath(path, method);
            return handler ? true : false;
        } catch(e) {
            return false;
        }
    }

    /**
     * Asynchronously simulates a request to a given path and HTTP method.
     *
     * @param {String} path The request path.
     * @param {String} method The HTTP method.
     * @param {Object} req The request object.
     * @param {Object} res The response object.
     * @throws {Error} If a request is made with an unsupported HTTP method, and exception will be thrown.
     * @throws {Error} If the requested endpoint does not exist, an exception will be thrown.
     * @throws {Error} If something goes wrong calling the endpoint's function, an exception will be thrown.
     * @returns {Promise<any>} The result of the handler execution, or an error object if not found.
     */
    async simulatePathRequest(path, method, req, res) {
        // Sanitize incoming data
        method = formatHTTPMethod(method);

        // Check if we're even working with a usable endpoint
        let handler;
        try {
            handler = await this.#retrieveHandlerFromURLPath(path, method);
        } catch(e) {
            throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
        }
        
        // Preform a call to said endpoint's function
        try {
            return await handler(req, res);
        } catch(e) {
            throw e;
        }
    }

    /**
     * Interpret a URL request path, and retrieve the associated handler function for that endpoint and method if one exists.
     * 
     * @param {String} path The request path.
     * @param {String} method The HTTP method.
     * @throws {Error} If a request is made with an unsupported HTTP method, and exception will be thrown.
     * @throws {Error} If the endpoint isn't defined, an exception will be thrown.
     * @returns {Function} The handler function at the specific requested endpoint and method.
     */
    async #retrieveHandlerFromURLPath(path, method, req) {
        // Check if the method is allowed by this router
        if (!this.#isSupportedHTTPMethod(method)) {
            throw { success: false, code: "NOT_ALLOWED", error: `Method '${method}' not supported.`, status: 405 };
        }

        // Interpret the path for a matching endpoint directory
        const routeNode = matchRoute(this.#routeRegistry, path, req);
        if (!validRouteNode(routeNode, method)) throw new Error();
    
        // Retrieve the attached endpoint function
        const filePath = retrieveRouteNodePath(routeNode, method);
        const module = await retrieveModuleFromFile(filePath);
        const handler = retrieveHandlerFromModule(module, method);
        return handler;
    }

    /*
        Helper Functions
    */

    /**
     * Ensure that a provided HTTP method is contained within our list of allowed methods.
     * 
     * @param {String} method The requested HTTP method.
     * @returns {Boolean} A boolean indication of whether this is a supported HTTP method.
     */
    #isSupportedHTTPMethod = (method) => this.#allowedMethods && this.#allowedMethods.indexOf(method) >= 0;
}

/**
 * Attempt to retrieve the functions defined in the "export default" signature of a specific file.
 * 
 * @param {String} filePath The local directory where the page file is hosted.
 * @returns {Object} The "export default" signature of a specific file.
 */
async function retrieveModuleFromFile(filePath) {
    const module = await import(filePath);
    return module;
}

/**
 * Attempt to retrieve a specific method function defined in the "export default" signature of a specific file.
 * 
 * @param {Object} module The "export default" signature of a specific file.
 * @param {String} method The HTTP method of the request.
 * @throws {Error} If the requested method function is not defined, an exception will be thrown.
 * @returns {Function} The callable endpoint function for the requested method.
 */
function retrieveHandlerFromModule(module, method) {
    const handler = module.default[method];
    if (typeof handler !== 'function') {
        console.error(`Handler for ${method} ${requestPath} is not a function.`);
        throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
    }
    return handler;
}

/**
 * Attempt to match an incoming request URL with it's associated endpoint and endpoint function(s).
 * 
 * If a segment is dynamic (ex: "/:customerID"), its value is extracted and added to `req.params`.
 *
 * @param {Object} routeRegistry The compiled routes JSON.
 * @param {String} path The request path.
 * @param {Object} [req = {}] The request object.
 * @returns {Object|null} Returns the matching route object (which should contain method keys) or null if no match.
 */
const matchRoute = (routeRegistry, path, req = {}) => {
    // Split the request path into segments (ignoring empty segments)
    const segments = path.split('/').filter(Boolean);
    let currentLevel = routeRegistry;
    const params = {};
  
    for (const segment of segments) {
        const exactKey = '/' + segment;
        if (currentLevel.hasOwnProperty(exactKey)) {
            // Found an exact match for the current segment
            currentLevel = currentLevel[exactKey];
        } else {
            // Look for a dynamic key: one that starts with "/:"
            let foundDynamic = false;
            for (const key in currentLevel) {
                if (key.startsWith('/:')) {
                    // For a key like "/:customerID", extract the parameter name ("customerID")
                    const paramName = key.slice(2);
                    params[paramName] = segment;
                    currentLevel = currentLevel[key];
                    foundDynamic = true;
                    break;
                }
            }
            if (!foundDynamic) {
                // No matching segment found
                return null;
            }
        }
    }
    // Inject the extracted parameters into req.params (assuming express based request)
    if (req.params) {
        req.params = { ...req.params, ...params };
    }
    return currentLevel;
};

/**
 * Properly format an HTTP string to be used in future sections of the routing code.
 * 
 * @param {String} method The requested HTTP method.
 * @returns {String} The properly formatted HTTP method string.
 */
const formatHTTPMethod = (method) => method.toUpperCase();

/**
 * Validate that a route node extracted from the compiled endpoint JSON file contains all necessary information to be used.
 * 
 * @param {Object} routeNode The endpoint detailed retrieved from the compiled endpoint JSON file.
 * @param {String} method The requested HTTP method.
 * @returns {Boolean} A boolean indication of the validity of this route node object.
 */
const validRouteNode = (routeNode, method) => typeof routeNode === 'object' // Ensure we're working with an object
                                                && routeNode // Ensure we're working with anything at all
                                                && routeNode[method] // Ensure we're working with a route node containing our desired HTTP method
                                                && routeNode[method].filePath; // Ensure our route node is discoverable in our files

/**
 * Extract the file path pointing to the endpoint signature from a route node.
 * 
 * @param {Object} routeNode The endpoint detailed retrieved from the compiled endpoint JSON file.
 * @param {String} method The requested HTTP method.
 * @returns {String} The absolute file path to the endpoint signature.
 */
const retrieveRouteNodePath = (routeNode, method) => routeNode[method].filePath;

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
 */
const buildEndpointRoutes = async (args) => {
    // Extract relevant argument values
    const configOutput = args['configOutput'] || 'routes.json';
    const handlersDir = args['handlersDir'] || 'endpoints';
    const pathBlacklist = args['pathBlacklist'] || null;
    const debug = args['debug'] || false;

    // Discover and compile all of the endpoint routes
    if (debug === true) console.log(`Searching for routes in '${handlersDir}' folder...`);
    const nestedRoutes = {};
    const handlersDirPath = path.join(path.resolve(), handlersDir);
    await loadRoutes(nestedRoutes, handlersDirPath, pathBlacklist, '', debug);

    // Write them all to a discoverable routes file
    if (debug === true) console.log(`Writing routes to ${configOutput}...`);
    fs.writeFileSync(configOutput, JSON.stringify(nestedRoutes, null, 2));
    if (debug === true) console.log(`Routes compiled successfully and saved to ${configOutput}!`);
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
            if (pathBlacklist.indexOf(file) >= 0) {
                if (debug === true) console.log(`Skipping directory ${file} as defined within the path blacklist`);
                continue;
            }
            
            // ... otherwise, continue to traverse the path
            const currentPath = basePath + '/' + file;
            await loadRoutes(fullPath, currentPath, pathBlacklist, basePath);
        } else if (file === 'index.js') {
            try {
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
                    insertRoute(nestedRoutes, routePath, method, fullPath);
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

export default endpointRouting;
export {
    buildEndpointRoutes
}