import { ENDPOINT_TYPES_GROUP } from "./constants.js";
import { insertRoute } from "./building-routes.js";
import {
    logPlatformRespectiveMessage,
    toPlatformPath
} from "./utilities.js";

class EndpointRoutingPackageManager {
    push(group, key, value) {
        this.packages ||= {};
        this.packages[group] ||= {};
        if (this.packages[group].hasOwnProperty[key]) {
            return false;
        }
        this.packages[group][key] = value;
        return true;
    }

    get(group) {
        this.packages ||= {};
        return this.packages[group] || {};
    }
}
const endpointRoutingPackageManager = new EndpointRoutingPackageManager();

/*
    Natively supported packages
*/

// JS Files
endpointRoutingPackageManager.push(
    ENDPOINT_TYPES_GROUP,
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
        }
    }
);

export default endpointRoutingPackageManager;