import fs from 'fs';
import path from 'path';

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

export {
    resolveAndValidatePath
}