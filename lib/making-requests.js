import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { resolveAndValidatePath } from './utilities.js';

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
 * @throws {Error} If the included `routesConfig` is not a valid path and point to a JSON file, an exception will be thrown.
 * @throws {Error} If the included `handlersDir` is not a valid path and point to a directory, an exception will be thrown.
 * @returns {EndpointRouting} A usable instance of the `EndpointRouting` class.
 */
function endpointRouting(args) {
    // Extract relevant arguments and autofill missing pieces
    const routesConfig = resolveAndValidatePath(
        args['routesConfig'] || 'routes.json',
        { mustExist: true, mustBeJson: true }
    );
    const handlersDir = resolveAndValidatePath(
        args['handlersDir'] || 'endpoints',
        { mustExist: true, mustBeDir: true }
    );
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
        const _req = req || {};
        const routeNode = matchRoute(this.#routeRegistry, path, _req);
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
    const segments = path.split('/').filter(Boolean);
    let currentLevel = routeRegistry;
    const params = {};

    for (const segment of segments) {
        const exactKey = '/' + segment;
        if (currentLevel.hasOwnProperty(exactKey)) {
            currentLevel = currentLevel[exactKey];
        } else {
            let foundDynamic = false;
            for (const key in currentLevel) {
                if (key.startsWith('/:')) {
                    const paramName = key.slice(2);
                    params[paramName] = segment;
                    currentLevel = currentLevel[key];
                    foundDynamic = true;
                    break;
                }
            }
            if (!foundDynamic) {
                return null;
            }
        }
    }

    // Inject dynamic parameters into req.params
    if (req) {
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


export default endpointRouting;