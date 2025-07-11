function loadPackageIfAvailable(packageName) {
    try {
        const module = require(packageName);
    } catch(e) {
        // Doesn't exist
    }
}
loadPackageIfAvailable('react-endpoint-routing');