import endpointRoutingPackageManager from "./package-manager.js";
import { insertRoute } from "./building-routes.js";
import path from 'path';
import { pathToFileURL } from 'url';
import {
    logPlatformRespectiveMessage,
    toPlatformPath,
    formatHTTPMethod
} from "./utilities.js";

// JS Files
endpointRoutingPackageManager.push(
    'endpoint-types',
    'js',
    {
        insert: async (fullPath, relativePath, routePath, nestedRoutes) => {
            const routeModule = await import(`file://${fullPath}`);
            
            if (!routeModule.default || typeof routeModule.default !== 'object') {
                logPlatformRespectiveMessage(`Warning: No valid handlers found in ${toPlatformPath(fullPath)}`);
                return;
            }
            
            // The current basePath represents the route for this index.js file
            for (const [method, handler] of Object.entries(routeModule.default)) {
                insertRoute(nestedRoutes, routePath, method, relativePath, routePath === '/');
            }
            logPlatformRespectiveMessage(`Registered route: ${routePath}`);
        },
        interpret: async(file, req, res, next = null) => {
            const method = formatHTTPMethod(req.method);
            const absolutePath = path.resolve(file);
            const fileURL = pathToFileURL(absolutePath).href;
            const module = await import(fileURL);
            const callback = module.default[method];
            if (typeof callback !== 'function') {
                console.error(`callback for ${method} ${requestPath} is not a function.`);
                throw { success: false, code: "NOT_FOUND", error: "Route not found.", status: 404 };
            }

            if (typeof next === 'function' && callback.length >= 3) {
                return await callback(req, res, next);
            } else {
                return await callback(req, res);
            }
        }
    }
);
