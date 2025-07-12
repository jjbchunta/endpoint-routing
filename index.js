import initializeRouting from './lib/making-requests.js';
import buildEndpointRoutes from './lib/building-routes.js';
import endpointRoutingPackageManager from './lib/package-manager.js';
import './lib/internal-packages.js';
import './lib/external-packages.cjs';

export default initializeRouting;
export { buildEndpointRoutes, endpointRoutingPackageManager };