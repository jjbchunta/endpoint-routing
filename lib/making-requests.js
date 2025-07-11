import path from 'path';
import { pathToFileURL } from 'url';
import { urlVariableSegment } from './building-routes.js';
import endpointRoutingPackageManager from './package-manager.js';
import {
    resolveAndValidatePath,
    readJSONFileSync,
    getFileExtension,
    formatHTTPMethod
} from './utilities.js';

/*
    █▀▄▀█ ▄▀█ █▄▀ █ █▄░█ █▀▀   █▀█ █▀▀ █▀█ █░█ █▀▀ █▀ ▀█▀ █▀
    █░▀░█ █▀█ █░█ █ █░▀█ █▄█   █▀▄ ██▄ ▀▀█ █▄█ ██▄ ▄█ ░█░ ▄█
*/

const endpointNotFoundErrorObject = {
    success: false,
    code: "NOT_FOUND",
    error: "Route not found.",
    status: 404
};

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
    if (routeAlgVersion > 1) {
        const endpointTypes = endpointRoutingPackageManager.get('endpoint-types');
        endpointRoutingConfig['endpointTypes'] = endpointTypes;
    }

    // Alter our main endpoint functions based on the route compile version
    let pathSimulateCallback;
    console.log(routeAlgVersion);
    switch(routeAlgVersion) {
        // Original routing implementation
        case 1:
            pathSimulateCallback = simulatePathRequest_iter_1;
            break;
        // The version implementing several endpoint type support
        case 2:
            pathSimulateCallback = simulatePathRequest_iter_2;
            break;
    }
    app['simulatePathRequest'] = pathSimulateCallback;

    // Append all of the functionality to the express instance
    app['routingConfig'] = endpointRoutingConfig;
    app['getWithRouting'] = getWithRouting;
    app['postWithRouting'] = postWithRouting;
    app['putWithRouting'] = putWithRouting;
    app['deleteWithRouting'] = deleteWithRouting;
    app['patchWithRouting'] = patchWithRouting;
    app['useWithRouting'] = useWithRouting;
    app['doesEndpointExist'] = doesEndpointExist;
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
function doesEndpointExist(path, method) {
    const routeNode = matchRoute(this.routingConfig.routeRegistry, path);
    return validRouteNode(routeNode, formatHTTPMethod(method));
}

/**
 * The request simulation code to be used with compiled route version #2.
 *
 * @param {String} requestPath The request path.
 * @param {String} method The HTTP method.
 * @param {Object} req The request object.
 * @param {Object} res The response object.
 * @param {Function} next Optional. The `next` function provided by express.
 * @throws {Error} If the requested endpoint does not exist, an exception will be thrown.
 * @throws {Error} If the file that exists as the endpoint file is not supported, an exception will be thrown.
 * @throws {Error} If something goes wrong calling the endpoint's function, an exception will be thrown.
 * @returns {Promise<any>} The result of the callback execution, or an error object if not found.
 */
async function simulatePathRequest_iter_2(requestPath, method, req, res, next = null) {
    method = formatHTTPMethod(method);
    const routeNode = matchRoute(this.routingConfig.routeRegistry, requestPath, req);
    if (!validRouteNode(routeNode, method)) throw endpointNotFoundErrorObject;
    const methodRouteNode = routeNode[method];

    const endpointFilePath = methodRouteNode.filePath;
    const endpointType = getEndpointType(methodRouteNode);
    if (!this.routingConfig.endpointTypes.hasOwnProperty(endpointType)) throw endpointNotFoundErrorObject;
    const interpretCallback = this.routingConfig.endpointTypes[endpointType].interpret;

    // Preform a callback to the endpoint type handler which will then handle processing the request
    return await interpretCallback(endpointFilePath, req, res, next);
}

/**
 * The request simulation code to be used with compiled route version #1.
 *
 * @param {String} requestPath The request path.
 * @param {String} method The HTTP method.
 * @param {Object} req The request object.
 * @param {Object} res The response object.
 * @param {Function} next Optional. The `next` function provided by express.
 * @throws {Error} If the requested endpoint does not exist, an exception will be thrown.
 * @throws {Error} If something goes wrong calling the endpoint's function, an exception will be thrown.
 * @returns {Promise<any>} The result of the callback execution, or an error object if not found.
 */
async function simulatePathRequest_iter_1(requestPath, method, req, res, next = null) {
    method = formatHTTPMethod(method);

    // Check if we're even working with a usable endpoint
    requestPath ||= '/';
    const routeNode = matchRoute(this.routingConfig.routeRegistry, requestPath, req);
    if (!validRouteNode(routeNode, method)) throw endpointNotFoundErrorObject;
    const methodRouteNode = routeNode[method];
    const filePath = methodRouteNode.filePath;
    const absolutePath = path.resolve(filePath);
    const fileURL = pathToFileURL(absolutePath).href;
    const module = await import(fileURL);
    const callback = module.default[method];
    if (typeof callback !== 'function') {
        console.error(`callback for ${method} ${requestPath} is not a function.`);
        throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
    }
    
    // Preform a call to said endpoint's function
    if (typeof next === 'function' && callback.length >= 3) {
        return await callback(req, res, next);
    } else {
        return await callback(req, res);
    }
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
 * Determine the type of endpoint file we're working with.
 * 
 * @param {Object} routeNode The endpoint detailed retrieved from the compiled endpoint JSON file.
 * @returns {String} The endpoint file type.
 */
function getEndpointType(routeNode) {
    if (routeNode.hasOwnProperty('type')) {
        return routeNode.type;
    } else {
        return getFileExtension(routeNode.filePath);
    }
}


export default initializeRouting;