import initializeRouting from './lib/making-requests.js';
import buildEndpointRoutes from './lib/building-routes.js';
import endpointRoutingPackageManager from './lib/package-manager.js';
import { ENDPOINT_TYPES_GROUP } from './lib/constants.js';

endpointRoutingPackageManager.push(
    ENDPOINT_TYPES_GROUP,
    'js',
    {}
);

export default initializeRouting;
export { buildEndpointRoutes, endpointRoutingPackageManager };