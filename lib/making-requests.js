import path from 'path';
import { pathToFileURL } from 'url';
import { resolveAndValidatePath, readJSONFileSync } from './utilities.js';
import { urlVariableSegment } from './building-routes.js';

/*
    █▀▄▀█ ▄▀█ █▄▀ █ █▄░█ █▀▀   █▀█ █▀▀ █▀█ █░█ █▀▀ █▀ ▀█▀ █▀
    █░▀░█ █▀█ █░█ █ █░▀█ █▄█   █▀▄ ██▄ ▀▀█ █▄█ ██▄ ▄█ ░█░ ▄█
*/

/**
 * Initalize an instance of the `EndpointRouting` class.
 * 
 * @param {Object} app An instance of an express server.
 * @param {String} routesConfig The path to the compiled routes JSON file relative to the project directory.
 * @throws {Error} If the included `routesConfig` is not a valid path and point to a JSON file, an exception will be thrown.
 */
function initializeRouting(app, routesConfig) {
    routesConfig = resolveAndValidatePath(
        routesConfig || 'routes.json',
        { mustExist: true, mustBeJson: true }
    );

    // Ensure there is a routes JSON file to read endpoints from
    const routeConfig = readJSONFileSync(routesConfig);
    let routeAlgVersion;
    let routeRegistry;
    if (!routeConfig.hasOwnProperty('routes')) {
        // If things like a version marker and routes are not defined, assume we're working with an OG compilation
        routeAlgVersion = 1;
        routeRegistry = routeConfig;
    } else {
        routeAlgVersion = routeConfig['version'];
        routeRegistry = routeConfig['routes'];
    }
    const endpointRoutingConfig = {
        'routeAlgVersion': routeAlgVersion,
        'routeRegistry': routeRegistry
    };

    // Append all of the functionality to the express instance
    app['routingConfig'] = endpointRoutingConfig;
    app['retrieveCallbackForEndpoint'] = retrieveCallbackForEndpoint;
    app['getWithRouting'] = getWithRouting;
    app['postWithRouting'] = postWithRouting;
    app['putWithRouting'] = putWithRouting;
    app['deleteWithRouting'] = deleteWithRouting;
    app['patchWithRouting'] = patchWithRouting;
    app['useWithRouting'] = useWithRouting;
    app['doesEndpointExist'] = doesEndpointExist;
    app['simulatePathRequest'] = simulatePathRequest;
}

/**
 * Preform a `GET` request to the requested endpoint, if it exists.
 * 
 * If the requested method doesn't match, or the endpoint doesn't exist, preform the provided
 * `next` function.
 */
function getWithRouting() {
    this.use(async (req, res, next) => {
        await handleMethodWithRouting('GET', req, res, next, this);
    });
}

/**
 * Preform a `POST` request to the requested endpoint, if it exists.
 * 
 * If the requested method doesn't match, or the endpoint doesn't exist, preform the provided
 * `next` function.
 */
function postWithRouting() {
    this.use(async (req, res, next) => {
        await handleMethodWithRouting('POST', req, res, next, this);
    });
}

/**
 * Preform a `PUT` request to the requested endpoint, if it exists.
 * 
 * If the requested method doesn't match, or the endpoint doesn't exist, preform the provided
 * `next` function.
 */
function putWithRouting() {
    this.use(async (req, res, next) => {
        await handleMethodWithRouting('PUT', req, res, next, this);
    });
}

/**
 * Preform a `DELETE` request to the requested endpoint, if it exists.
 * 
 * If the requested method doesn't match, or the endpoint doesn't exist, preform the provided
 * `next` function.
 */
function deleteWithRouting() {
    this.use(async (req, res, next) => {
        await handleMethodWithRouting('DELETE', req, res, next, this);
    });
}

/**
 * Preform a `PATCH` request to the requested endpoint, if it exists.
 * 
 * If the requested method doesn't match, or the endpoint doesn't exist, preform the provided
 * `next` function.
 */
function patchWithRouting() {
    this.use(async (req, res, next) => {
        await handleMethodWithRouting('PATCH', req, res, next, this);
    });
}

/**
 * Preform a request to the requested endpoint, regardless of method, if it exists.
 * 
 * If the requested method doesn't match, or the endpoint doesn't exist, preform the provided
 * `next` function.
 */
function useWithRouting() {
    this.use(async (req, res, next) => {
        await handleMethodWithRouting(null, req, res, next, this);
    });
}

/**
 * Preform a request to a requested endpoint under a specific HTTP method, if it exists.
 * 
 * @param {String} method The HTTP method we're making this request for. If the requested method
 * doesn't match, or the endpoint doesn't exist, preform the provided `next` function.
 * @param {Object} req The request object.
 * @param {Object} res The response object.
 * @param {Function} next The `next` function provided by express.
 * @param {Object} parent An instance of the express server.
 */
async function handleMethodWithRouting(method, req, res, next, parent) {
    const requestMethod = formatHTTPMethod(req.method);
    if ( method != null && requestMethod != method ) {
        next();
        return;
    }
    try {
        await parent.simulatePathRequest(req.path, requestMethod, req, res, next);
    } catch (e) {
        if (e.hasOwnProperty('code') && e.code === 'NOT_FOUND') {
            // Endpoint not found, move on
            next();
            return;
        } else {
            throw e;
        }
    }
    next();
    return;
}

/**
 * Check to see if an endpoint at a specific path and method exists.
 * 
 * @param {String} path The request path.
 * @param {String} method The HTTP method.
 * @returns {Boolean} A boolean indication of the path existance.
 */
async function doesEndpointExist(path, method) {
    // Sanitize incoming data
    method = formatHTTPMethod(method);

    // Simply check if we're able to successfully retrieve a callback at a specific endpoint + method
    try {
        const callback = await this.retrieveCallbackForEndpoint(path, method);
        return callback ? true : false;
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
 * @param {Function} next Optional. The `next` function provided by express.
 * @throws {Error} If the requested endpoint does not exist, an exception will be thrown.
 * @throws {Error} If something goes wrong calling the endpoint's function, an exception will be thrown.
 * @returns {Promise<any>} The result of the callback execution, or an error object if not found.
 */
async function simulatePathRequest(path, method, req, res, next = null) {
    // Sanitize incoming data
    method = formatHTTPMethod(method);

    // Check if we're even working with a usable endpoint
    let callback;
    try {
        callback = await this.retrieveCallbackForEndpoint(path, method, req);
    } catch(e) {
        throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
    }
    
    // Preform a call to said endpoint's function
    try {
        if (typeof next === 'function' && callback.length >= 3) {
            return await callback(req, res, next);
        } else {
            return await callback(req, res);
        }
    } catch(e) {
        throw e;
    }
}

/**
 * Interpret a URL request path, and retrieve the associated callback function for that endpoint and method if one exists.
 * 
 * @param {String} path The request path.
 * @param {String} method The HTTP method.
 * @throws {Error} If a request is made with an unsupported HTTP method, and exception will be thrown.
 * @throws {Error} If the endpoint isn't defined, an exception will be thrown.
 * @returns {Function} The callback function at the specific requested endpoint and method.
 */
async function retrieveCallbackForEndpoint(path, method, req) {
    path ||= '/';
    const routeNode = matchRoute(this.routingConfig.routeRegistry, path, req);
    if (!validRouteNode(routeNode, method)) throw new Error();
    const filePath = retrieveRouteNodePath(routeNode, method);
    const module = await retrieveModuleFromFile(filePath);
    const callback = retrieveCallbackFromModule(module, method);
    return callback;
}

/**
 * Attempt to retrieve the functions defined in the "export default" signature of a specific file.
 * 
 * @param {String} filePath The local directory where the page file is hosted.
 * @returns {Object} The "export default" signature of a specific file.
 */
async function retrieveModuleFromFile(filePath) {
    // Resolve to absolute path from project root
    const absolutePath = path.resolve(filePath);
    const fileURL = pathToFileURL(absolutePath).href;
    const module = await import(fileURL);
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
function retrieveCallbackFromModule(module, method) {
    const callback = module.default[method];
    if (typeof callback !== 'function') {
        console.error(`callback for ${method} ${requestPath} is not a function.`);
        throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
    }
    return callback;
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
    if (path === '/') {
        // Handle root directory requests
        let handler = null;
        if (routeRegistry.hasOwnProperty('/')) {
            handler = routeRegistry['/'];
        }
        return handler;
    }

    const pathParts = path.split('/').filter(Boolean);
    let currentLevel = routeRegistry;

    // Step through the hierarchy of the registry using the requested URL path
    for (const urlSegment of pathParts) {
        const formattedURLSegment = '/' + urlSegment;
        if (currentLevel.hasOwnProperty(formattedURLSegment)) {
            currentLevel = currentLevel[formattedURLSegment];
            continue;
        }

        let isDynamicValue = false;
        for (const possibleRoute in currentLevel) {
            if (!possibleRoute.startsWith(urlVariableSegment)) continue;

            const paramName = possibleRoute.slice(2);
            req.params[paramName] = urlSegment;
            currentLevel = currentLevel[possibleRoute];
            isDynamicValue = true;
            break;
        }
        if (!isDynamicValue) {
            return null;
        }
    }

    return currentLevel;
};

/**
 * Properly format an HTTP string to be used in future sections of the routing code.
 * 
 * @param {String} method The requested HTTP method.
 * @returns {String} The properly formatted HTTP method string.
 */
const formatHTTPMethod = (method) => method.toUpperCase().trim();

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


export default initializeRouting;