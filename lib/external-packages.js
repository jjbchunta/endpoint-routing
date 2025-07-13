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
externalPackages.forEach(package => {
    packageImports.push(
        loadPackageIfAvailable(package)
    );
});
await Promise.all(packageImports);