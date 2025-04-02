import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolves and validates a file or directory path based on specified constraints.
 *
 * @param {String} inputPath - The input path to resolve and validate. Can be relative or absolute.
 * @param {Object} [options] - An optional configuration object to enforce validation rules.
 * @param {Boolean} [options.mustExist=false] - If true, the function will throw an error if the resolved path does not exist.
 * @param {Boolean} [options.mustBeJson=false] - If true, the function will throw an error if the resolved path is not a `.json` file.
 * @param {Boolean} [options.mustBeDir=false] - If true, the function will throw an error if the resolved path is not a directory.
 *
 * @throws {Error} If any of the specified validation conditions are not met.
 * @returns {String} The normalized absolute path.
 *
 * @example const path = resolveAndValidatePath('configs/routes.json', { mustExist: true, mustBeJson: true });
 * @example const dirPath = resolveAndValidatePath('./endpoints', { mustExist: true, mustBeDir: true });
 */
function resolveAndValidatePath(inputPath, { mustExist = false, mustBeJson = false, mustBeDir = false } = {}) {
    const resolvedPath = path.resolve(inputPath);

    if (mustExist && !fs.existsSync(resolvedPath)) {
        throw new Error(`Path does not exist: ${resolvedPath}`);
    }

    if (mustBeJson && path.extname(resolvedPath) !== '.json') {
        throw new Error(`Expected a .json file but received: ${resolvedPath}`);
    }

    if (mustBeDir && fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
        throw new Error(`Expected a directory but received a file: ${resolvedPath}`);
    }

    return path.relative(process.cwd(), resolvedPath).replace(/\\/g, '/');
}

/**
 * Converts a file path to the correct platform-specific format.
 *
 * @param {String} inputPath - A file path (e.g., from routes.json).
 * @returns {String} A path formatted using the current operating system's path separator.
 *
 * @example
 * toPlatformPath('endpoints/user/[id]/index.js');
 * // On Windows => 'endpoints\\user\\[id]\\index.js'
 * // On macOS/Linux => 'endpoints/user/[id]/index.js'
 */
function toPlatformPath(inputPath) {
    return inputPath.split('/').join(path.sep);
}

/**
 * Converts a file path to the correct platform-specific format, then logs it to the console.
 * 
 * This function uses `toPlatformPath` that preforms this conversion and returns the resulting
 * string. See that function if you wish to manage the output instead of print it.
 *
 * @param {String} message - A message contining a file path.
 *
 * @example
 * toPlatformPath('endpoints/user/[id]/index.js');
 * // On Windows => 'endpoints\\user\\[id]\\index.js'
 * // On macOS/Linux => 'endpoints/user/[id]/index.js'
 */
function logPlatformRespectiveMessage(message) {
    console.log(toPlatformPath(message));
}

/**
 * Attempt to synchronously read the contents of a file.
 * 
 * @param {String} dir The path to the respective file.
 * @param {String} encoding 
 * @returns {String} Returns the content of the file if exists.
 */
function readFileSync(dir, encoding = 'utf-8') {
	return fs.readFileSync(dir, encoding);
}

/**
 * Attempt to synchronously read the contents of a file, and format the contents to a JSON object.
 * 
 * @param {String} dir The path to the respective file.
 * @returns {Object} Returns the content of the file if exists formatted into a JSON object.
 */
function readJSONFileSync(dir) {
	const content = readFileSync(dir, 'utf-8');
	return JSON.parse(content);
}

/**
 * Relay the contents of the project's _package.json_ file.
 * 
 * @param {String} path The path to the respective file.
 * @returns {Object} Returns the content of the package.json file formatted as a JSON object.
 */
function readNodePackageJSONFile() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packagePath = path.join(__dirname, '../package.json');
	return readJSONFileSync(packagePath);
}

/**
 * Get the value of a specific key within the NodeJS project "package.json" file.
 * 
 * @param {String} key The key of the value we wish to retrieve. Nested values should use a
 * directory like format, such as ``` project/version ```.
 */
function getNodePackageValue(key) {
	const keys = key.split("/");
	let result = readNodePackageJSONFile();
	for (let searchKey of keys) {
		if (!result.hasOwnProperty(searchKey)) {
			return null;
		}
		result = result[searchKey];
	}
	return result;
}

export {
    resolveAndValidatePath,
    toPlatformPath,
    logPlatformRespectiveMessage,
    readFileSync,
    readJSONFileSync,
    readNodePackageJSONFile,
    getNodePackageValue
}