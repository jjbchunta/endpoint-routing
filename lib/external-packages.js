const externalPackages = [
    'react-endpoint-routing'
];

async function loadPackageIfAvailable(packageName) {
    try {
        await import(packageName);
    } catch(e) {
        // Doesn't exist
    }
}
let packageImports = [];
for(let packageIndex = 0; packageIndex < externalPackages.length; packageIndex++) {
    packageImports.push(
        loadPackageIfAvailable(externalPackages[packageIndex])
    );
}
await Promise.all(packageImports);